function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const publicBaseUrl = (process.env.PUBLIC_BASE_URL?.trim() || 'https://bill.vhtm.eu').replace(/\/$/, '');
const oauthSessionSecret =
  process.env.OAUTH_SESSION_SECRET?.trim() || `${process.env.MCP_BEARER_TOKEN || ''}:${process.env.YNAB_ACCESS_TOKEN || ''}`;

export const config = {
  port: Number(process.env.PORT || 8000),
  publicBaseUrl,
  ynabAccessToken: requireEnv('YNAB_ACCESS_TOKEN'),
  mcpBearerToken: requireEnv('MCP_BEARER_TOKEN'),
  defaultPlanId: process.env.YNAB_DEFAULT_PLAN_ID?.trim() || undefined,
  oauthLoginUsername: process.env.OAUTH_LOGIN_USERNAME?.trim() || 'json',
  oauthLoginPassword: requireEnv('OAUTH_LOGIN_PASSWORD'),
  oauthSessionSecret,
  oauthStateFile: process.env.OAUTH_STATE_FILE?.trim() || './data/oauth-state.json',
};
