// Minimal YNAB client configuration shared by the MCP server and the Bill web app.
// Only needs the YNAB personal access token; everything else is passed explicitly.

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const ynabConfig = {
  accessToken: requireEnv('YNAB_ACCESS_TOKEN'),
  defaultPlanId: process.env.YNAB_DEFAULT_PLAN_ID?.trim() || undefined,
};
