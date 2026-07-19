import { createHash } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { config } from './config.ts';
import { createServer } from './mcpServer.ts';
import { OAuthService } from './oauth.ts';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,mcp-protocol-version,mcp-session-id,last-event-id',
  'access-control-expose-headers': 'mcp-protocol-version,mcp-session-id',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, init?: ResponseInit): Response {
  return withCors(Response.json(data, init));
}

const oauth = new OAuthService({
  issuer: config.publicBaseUrl,
  resource: `${config.publicBaseUrl}/mcp`,
  stateFile: config.oauthStateFile,
  sessionSecret: config.oauthSessionSecret,
  loginUsername: config.oauthLoginUsername,
  loginPassword: config.oauthLoginPassword,
  staticBearerToken: config.mcpBearerToken,
  secureCookies: config.publicBaseUrl.startsWith('https://'),
  supportedScopes: ['mcp:tools'],
});

async function authenticateMcpRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  const auth = oauth.verifyAccessToken(token);
  if (!auth) return null;
  if (!auth.scopes.includes('mcp:tools')) return null;
  if (auth.resource !== `${config.publicBaseUrl}/mcp`) return null;
  return {
    token,
    clientId: auth.clientId,
    scopes: auth.scopes,
    expiresAt: auth.expiresAt,
    resource: new URL(auth.resource),
  };
}

async function handleMcp(request: Request): Promise<Response> {
  const authInfo = await authenticateMcpRequest(request);
  const accept = request.headers.get('accept') ?? '';
  const ct = request.headers.get('content-type') ?? '';
  const protoVer = request.headers.get('mcp-protocol-version') ?? '';
  const sessId = request.headers.get('mcp-session-id') ?? '';
  let rpcMethod = '';
  let bodyText = '';
  if (request.method === 'POST') {
    try {
      bodyText = await request.clone().text();
      rpcMethod = (JSON.parse(bodyText)?.method as string) ?? '';
    } catch {
      rpcMethod = '<unparseable>';
    }
  }
  console.log(
    `[mcp] ${request.method} auth=${authInfo ? 'ok' : 'NONE'} rpc=${rpcMethod || '-'} ` +
      `accept="${accept}" ct="${ct}" proto="${protoVer}" sess="${sessId}" bodyLen=${bodyText.length}`,
  );
  if (!authInfo) {
    const headers = oauth.buildUnauthorizedHeaders();
    headers.set('content-type', 'application/json');
    return withCors(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers }));
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer();

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { authInfo });
    console.log(`[mcp] -> ${request.method} rpc=${rpcMethod || '-'} status=${response.status} ct="${response.headers.get('content-type') ?? ''}"`);
    await server.close();
    await transport.close();
    return withCors(response);
  } catch (error) {
    console.error('MCP request failed', error);
    await server.close().catch(() => undefined);
    await transport.close().catch(() => undefined);
    return json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal server error',
        },
        id: null,
      },
      { status: 500 },
    );
  }
}

const staticFingerprint = createHash('sha256').update(config.mcpBearerToken).digest('hex').slice(0, 12);

const app = Bun.serve({
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname !== '/health') {
      console.log(`[req] ${request.method} ${url.pathname}${url.search} ua="${request.headers.get('user-agent') ?? ''}"`);
    }

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'bill-mcp',
        version: '0.2.0',
        readOnly: true,
        oauthEnabled: true,
        staticBearerFingerprint: staticFingerprint,
      });
    }

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(oauth.getAuthorizationServerMetadata(), { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
      return json(oauth.getProtectedResourceMetadata(), { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/oauth/register' && request.method === 'POST') {
      try {
        const body = await request.json();
        return json(oauth.registerClient(body), { status: 201, headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        return json(
          { error: 'invalid_client_metadata', error_description: error instanceof Error ? error.message : 'Invalid request' },
          { status: 400 },
        );
      }
    }

    if (url.pathname === '/oauth/authorize' && (request.method === 'GET' || request.method === 'POST')) {
      return withCors(await oauth.handleAuthorize(request));
    }

    if (url.pathname === '/oauth/token' && request.method === 'POST') {
      return withCors(await oauth.handleToken(request));
    }

    if (url.pathname === '/oauth/logout' && request.method === 'POST') {
      return withCors(
        new Response(null, {
          status: 204,
          headers: { 'set-cookie': oauth.clearSessionCookie() },
        }),
      );
    }

    if (url.pathname === '/mcp') {
      return handleMcp(request);
    }

    return withCors(new Response('Not found', { status: 404 }));
  },
});

console.log(`bill-mcp listening on http://localhost:${app.port}`);
console.log(`health: http://localhost:${app.port}/health`);
console.log(`mcp: http://localhost:${app.port}/mcp`);
console.log(`issuer: ${config.publicBaseUrl}`);
console.log(`oauth metadata: ${config.publicBaseUrl}/.well-known/oauth-authorization-server`);
console.log(`protected resource metadata: ${config.publicBaseUrl}/.well-known/oauth-protected-resource/mcp`);
