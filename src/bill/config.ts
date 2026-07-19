// Configuration for Bill — the read-only, unauthenticated joint-budget status site.

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const billConfig = {
  port: Number(process.env.BILL_PORT || 3009),
  budgetId: requireEnv('BILL_BUDGET_ID'),
  // Ordered list of joint category groups to display as separate sections.
  jointGroupIds: requireEnv('BILL_JOINT_GROUP_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  jointAccountId: requireEnv('BILL_JOINT_ACCOUNT_ID'),
  cacheTtlMs: Number(process.env.BILL_CACHE_TTL_SECONDS || 300) * 1000,
};
