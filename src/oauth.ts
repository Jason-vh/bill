import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type OAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none';
  scope?: string;
  created_at: number;
};

type AccessTokenRecord = {
  token: string;
  client_id: string;
  scopes: string[];
  resource: string;
  expires_at: number;
};

type AuthorizationCodeRecord = {
  code: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  resource: string;
  expires_at: number;
};

type PersistedState = {
  clients: Record<string, OAuthClient>;
  accessTokens: Record<string, AccessTokenRecord>;
};

type OAuthConfig = {
  issuer: string;
  resource: string;
  stateFile: string;
  sessionSecret: string;
  loginUsername: string;
  loginPassword: string;
  staticBearerToken?: string;
  secureCookies: boolean;
  supportedScopes: string[];
};

function ensureParent(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

function readPersistedState(path: string): PersistedState {
  try {
    const text = readFileSync(path, 'utf8');
    const parsed = JSON.parse(text) as Partial<PersistedState>;
    return {
      clients: parsed.clients ?? {},
      accessTokens: parsed.accessTokens ?? {},
    };
  } catch {
    return { clients: {}, accessTokens: {} };
  }
}

function writePersistedState(path: string, state: PersistedState) {
  ensureParent(path);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256Base64Url(input: string): string {
  return base64Url(createHash('sha256').update(input).digest());
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    out[key] = value;
  }
  return out;
}

function encodeSession(payload: Record<string, unknown>, secret: string): string {
  const body = base64Url(JSON.stringify(payload));
  const signature = base64Url(createHmac('sha256', secret).update(body).digest());
  return `${body}.${signature}`;
}

function decodeSession(token: string | undefined, secret: string): Record<string, unknown> | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = base64Url(createHmac('sha256', secret).update(body).digest());
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as Record<string, unknown>;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function clearCookie(name: string, secure: boolean): string {
  return [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'https:' || parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return false;
  }
}

export class OAuthService {
  private authCodes = new Map<string, AuthorizationCodeRecord>();

  constructor(private readonly config: OAuthConfig) {
    ensureParent(config.stateFile);
  }

  private readState(): PersistedState {
    return readPersistedState(this.config.stateFile);
  }

  private writeState(state: PersistedState) {
    writePersistedState(this.config.stateFile, state);
  }

  private now() {
    return Date.now();
  }

  private cleanupExpired(state: PersistedState): PersistedState {
    const now = this.now();
    for (const [token, data] of Object.entries(state.accessTokens)) {
      if (data.expires_at <= now) delete state.accessTokens[token];
    }
    for (const [code, data] of this.authCodes.entries()) {
      if (data.expires_at <= now) this.authCodes.delete(code);
    }
    return state;
  }

  public getAuthorizationServerMetadata() {
    return {
      issuer: this.config.issuer,
      authorization_endpoint: `${this.config.issuer}/oauth/authorize`,
      token_endpoint: `${this.config.issuer}/oauth/token`,
      registration_endpoint: `${this.config.issuer}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: this.config.supportedScopes,
    };
  }

  public getProtectedResourceMetadata() {
    return {
      resource: this.config.resource,
      authorization_servers: [this.config.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: this.config.supportedScopes,
      resource_name: 'YNAB MCP',
    };
  }

  public registerClient(body: unknown): OAuthClient {
    const payload = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const redirect_uris = Array.isArray(payload.redirect_uris)
      ? payload.redirect_uris.filter((value): value is string => typeof value === 'string' && isAllowedRedirectUri(value))
      : [];

    if (redirect_uris.length === 0) {
      throw new Error('redirect_uris must contain at least one valid https://, http://localhost, or http://127.0.0.1 URI');
    }

    const client: OAuthClient = {
      client_id: randomBytes(16).toString('hex'),
      client_name: typeof payload.client_name === 'string' && payload.client_name.trim() ? payload.client_name.trim() : 'Claude MCP Client',
      redirect_uris,
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: this.config.supportedScopes.join(' '),
      created_at: Math.floor(this.now() / 1000),
    };

    const state = this.cleanupExpired(this.readState());
    state.clients[client.client_id] = client;
    this.writeState(state);
    return client;
  }

  public getClient(clientId: string): OAuthClient | null {
    const state = this.cleanupExpired(this.readState());
    this.writeState(state);
    return state.clients[clientId] ?? null;
  }

  private renderAuthorizePage(params: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    scope?: string;
    resource?: string;
    error?: string;
  }) {
    const hidden = (name: string, value?: string) =>
      `<input type="hidden" name="${htmlEscape(name)}" value="${htmlEscape(value ?? '')}">`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize YNAB MCP</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; background: #f5f7fb; color: #111827; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { width: min(420px, calc(100vw - 32px)); background: white; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,.12); padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 10px; }
    p { color: #4b5563; line-height: 1.5; }
    label { display: block; font-size: 14px; margin: 16px 0 6px; color: #374151; }
    input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 14px; box-sizing: border-box; }
    button { width: 100%; margin-top: 18px; padding: 12px; border: 0; border-radius: 10px; background: #2563eb; color: white; font-size: 15px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { margin-top: 14px; color: #b91c1c; background: #fee2e2; padding: 10px 12px; border-radius: 10px; }
    .meta { margin-top: 16px; font-size: 12px; color: #6b7280; word-break: break-all; }
  </style>
</head>
<body>
  <form method="POST" class="card">
    <h1>Authorize Claude to use YNAB MCP</h1>
    <p>This server is read-only. Signing in lets Claude inspect budgets, accounts, categories, and transactions, but not modify them.</p>
    ${hidden('client_id', params.clientId)}
    ${hidden('redirect_uri', params.redirectUri)}
    ${hidden('response_type', 'code')}
    ${hidden('state', params.state)}
    ${hidden('code_challenge', params.codeChallenge)}
    ${hidden('code_challenge_method', params.codeChallengeMethod)}
    ${hidden('scope', params.scope)}
    ${hidden('resource', params.resource)}
    <label for="username">Username</label>
    <input id="username" name="username" autocomplete="username" value="${htmlEscape(this.config.loginUsername)}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password">
    <button type="submit">Authorize</button>
    ${params.error ? `<div class="error">${htmlEscape(params.error)}</div>` : ''}
    <div class="meta">Client: ${htmlEscape(params.clientId)}<br>Redirect URI: ${htmlEscape(params.redirectUri)}</div>
  </form>
</body>
</html>`;
  }

  private createSessionValue() {
    return encodeSession({ sub: this.config.loginUsername, exp: this.now() + 1000 * 60 * 60 * 24 * 30 }, this.config.sessionSecret);
  }

  private hasValidSession(request: Request): boolean {
    const cookies = parseCookies(request.headers.get('cookie'));
    return decodeSession(cookies.ynab_mcp_session, this.config.sessionSecret) !== null;
  }

  private issueAuthorizationCode(input: Omit<AuthorizationCodeRecord, 'code' | 'expires_at'>): string {
    const code = randomBytes(32).toString('hex');
    this.authCodes.set(code, {
      ...input,
      code,
      expires_at: this.now() + 5 * 60 * 1000,
    });
    return code;
  }

  public async handleAuthorize(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const values = request.method === 'POST'
      ? Object.fromEntries((await request.formData()).entries())
      : Object.fromEntries(url.searchParams.entries());

    const clientId = String(values.client_id ?? '');
    const redirectUri = String(values.redirect_uri ?? '');
    const responseType = String(values.response_type ?? '');
    const state = values.state ? String(values.state) : undefined;
    const codeChallenge = values.code_challenge ? String(values.code_challenge) : undefined;
    const codeChallengeMethod = values.code_challenge_method ? String(values.code_challenge_method) : undefined;
    const scope = values.scope ? String(values.scope) : undefined;
    const resource = values.resource ? String(values.resource) : this.config.resource;

    const client = this.getClient(clientId);
    if (!client) {
      return Response.json({ error: 'invalid_client', error_description: 'Unknown client_id' }, { status: 400 });
    }

    if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
      return Response.json({ error: 'invalid_request', error_description: 'Unregistered redirect_uri' }, { status: 400 });
    }

    if (responseType !== 'code') {
      return Response.json({ error: 'unsupported_response_type', error_description: 'Only response_type=code is supported' }, { status: 400 });
    }

    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return Response.json({ error: 'invalid_request', error_description: 'PKCE with code_challenge_method=S256 is required' }, { status: 400 });
    }

    const requestedScopes = (scope ?? this.config.supportedScopes.join(' '))
      .split(/\s+/)
      .filter(Boolean);
    const unsupported = requestedScopes.filter((item) => !this.config.supportedScopes.includes(item));
    if (unsupported.length > 0) {
      return Response.json({ error: 'invalid_scope', error_description: `Unsupported scope(s): ${unsupported.join(', ')}` }, { status: 400 });
    }

    if (resource !== this.config.resource) {
      return Response.json({ error: 'invalid_target', error_description: 'Unsupported resource' }, { status: 400 });
    }

    const paramsForPage = {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      scope: requestedScopes.join(' '),
      resource,
    };

    if (request.method === 'GET' && this.hasValidSession(request)) {
      const code = this.issueAuthorizationCode({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        scope: requestedScopes.join(' '),
        resource,
      });
      const target = new URL(redirectUri);
      target.searchParams.set('code', code);
      if (state) target.searchParams.set('state', state);
      return Response.redirect(target.toString(), 302);
    }

    if (request.method === 'GET') {
      return new Response(this.renderAuthorizePage(paramsForPage), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    const username = String(values.username ?? '').trim();
    const password = String(values.password ?? '');
    if (username !== this.config.loginUsername || password !== this.config.loginPassword) {
      return new Response(this.renderAuthorizePage({ ...paramsForPage, error: 'Invalid username or password.' }), {
        status: 401,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    const code = this.issueAuthorizationCode({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope: requestedScopes.join(' '),
      resource,
    });
    const target = new URL(redirectUri);
    target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);

    return new Response(null, {
      status: 302,
      headers: {
        location: target.toString(),
        'set-cookie': setCookie('ynab_mcp_session', this.createSessionValue(), 60 * 60 * 24 * 30, this.config.secureCookies),
        'cache-control': 'no-store',
      },
    });
  }

  public async handleToken(request: Request): Promise<Response> {
    const body = request.headers.get('content-type')?.includes('application/json')
      ? ((await request.json()) as Record<string, unknown>)
      : Object.fromEntries((await request.formData()).entries());

    const grantType = String(body.grant_type ?? '');
    if (grantType !== 'authorization_code') {
      return Response.json({ error: 'unsupported_grant_type', error_description: 'Only authorization_code is supported' }, { status: 400 });
    }

    const code = String(body.code ?? '');
    const clientId = String(body.client_id ?? '');
    const redirectUri = String(body.redirect_uri ?? '');
    const codeVerifier = String(body.code_verifier ?? '');

    const authCode = this.authCodes.get(code);
    if (!authCode || authCode.expires_at <= this.now()) {
      if (authCode) this.authCodes.delete(code);
      return Response.json({ error: 'invalid_grant', error_description: 'Invalid or expired authorization code' }, { status: 400 });
    }
    this.authCodes.delete(code);

    if (authCode.client_id !== clientId) {
      return Response.json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, { status: 400 });
    }
    if (authCode.redirect_uri !== redirectUri) {
      return Response.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400 });
    }
    if (authCode.code_challenge && sha256Base64Url(codeVerifier) !== authCode.code_challenge) {
      return Response.json({ error: 'invalid_grant', error_description: 'Invalid code_verifier' }, { status: 400 });
    }

    const accessToken = randomBytes(32).toString('hex');
    const expiresInSeconds = 60 * 60 * 24 * 30;
    const expiresAt = this.now() + expiresInSeconds * 1000;

    const state = this.cleanupExpired(this.readState());
    state.accessTokens[accessToken] = {
      token: accessToken,
      client_id: clientId,
      scopes: (authCode.scope ?? this.config.supportedScopes.join(' ')).split(/\s+/).filter(Boolean),
      resource: authCode.resource,
      expires_at: expiresAt,
    };
    this.writeState(state);

    return Response.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresInSeconds,
        scope: authCode.scope ?? this.config.supportedScopes.join(' '),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  public verifyAccessToken(token: string): { clientId: string; scopes: string[]; expiresAt: number; resource: string } | null {
    if (this.config.staticBearerToken && token === this.config.staticBearerToken) {
      return {
        clientId: 'static-bearer',
        scopes: this.config.supportedScopes,
        expiresAt: Math.floor((this.now() + 1000 * 60 * 60 * 24 * 365) / 1000),
        resource: this.config.resource,
      };
    }

    const state = this.cleanupExpired(this.readState());
    this.writeState(state);
    const found = state.accessTokens[token];
    if (!found) return null;
    if (found.expires_at <= this.now()) {
      delete state.accessTokens[token];
      this.writeState(state);
      return null;
    }
    return {
      clientId: found.client_id,
      scopes: found.scopes,
      expiresAt: Math.floor(found.expires_at / 1000),
      resource: found.resource,
    };
  }

  public buildUnauthorizedHeaders(): Headers {
    const headers = new Headers();
    headers.set(
      'www-authenticate',
      `Bearer resource_metadata="${this.config.issuer}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`,
    );
    return headers;
  }

  public clearSessionCookie(): string {
    return clearCookie('ynab_mcp_session', this.config.secureCookies);
  }
}
