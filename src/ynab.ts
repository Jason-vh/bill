import { config } from './config.ts';
import type {
  YnabAccount,
  YnabCategoryGroup,
  YnabPlanSummary,
  YnabTransaction,
} from './types.ts';

const API_BASE = 'https://api.ynab.com/v1';

type YnabEnvelope<T> = {
  data: T;
  error?: {
    id?: string;
    name?: string;
    detail?: string;
  };
};

async function ynabRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.ynabAccessToken}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const json = text ? (JSON.parse(text) as YnabEnvelope<T>) : null;

  if (!response.ok || !json) {
    const detail = json && 'error' in json ? json.error?.detail : text;
    throw new Error(`YNAB request failed (${response.status} ${response.statusText}): ${detail || 'unknown error'}`);
  }

  return json.data;
}

async function ynabGet<T>(path: string): Promise<T> {
  return ynabRequest<T>(path);
}

export async function listPlans(): Promise<{
  plans: YnabPlanSummary[];
  defaultPlan: YnabPlanSummary | null;
}> {
  const data = await ynabGet<{
    plans: YnabPlanSummary[];
    default_plan?: YnabPlanSummary | null;
  }>('/plans');

  return {
    plans: data.plans,
    defaultPlan: data.default_plan ?? null,
  };
}

export async function resolvePlanId(requestedPlanId?: string): Promise<string> {
  if (requestedPlanId?.trim()) return requestedPlanId.trim();
  if (config.defaultPlanId) return config.defaultPlanId;

  const { plans, defaultPlan } = await listPlans();
  if (defaultPlan?.id) return defaultPlan.id;
  if (plans[0]?.id) return plans[0].id;

  throw new Error('No YNAB plans found for this token');
}

export async function getAccounts(planId?: string): Promise<{ planId: string; accounts: YnabAccount[] }> {
  const resolved = await resolvePlanId(planId);
  const data = await ynabGet<{ accounts: YnabAccount[] }>(`/plans/${resolved}/accounts`);
  return { planId: resolved, accounts: data.accounts };
}

export async function getCategories(planId?: string): Promise<{ planId: string; categoryGroups: YnabCategoryGroup[] }> {
  const resolved = await resolvePlanId(planId);
  const data = await ynabGet<{ category_groups: YnabCategoryGroup[] }>(`/plans/${resolved}/categories`);
  return { planId: resolved, categoryGroups: data.category_groups };
}

export async function getTransactions(options?: {
  planId?: string;
  sinceDate?: string;
  type?: 'uncategorized' | 'unapproved';
}): Promise<{ planId: string; transactions: YnabTransaction[] }> {
  const resolved = await resolvePlanId(options?.planId);
  const params = new URLSearchParams();
  if (options?.sinceDate) params.set('since_date', options.sinceDate);
  if (options?.type) params.set('type', options.type);

  const query = params.size ? `?${params.toString()}` : '';
  const data = await ynabGet<{ transactions: YnabTransaction[] }>(`/plans/${resolved}/transactions${query}`);
  return { planId: resolved, transactions: data.transactions };
}

export async function createTransaction(options: {
  planId?: string;
  accountId: string;
  date: string;
  amount: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  approved?: boolean;
  cleared?: 'cleared' | 'uncleared' | 'reconciled';
  importId?: string;
}): Promise<{ planId: string; transaction: YnabTransaction; duplicateImportIds: string[] }> {
  const resolved = await resolvePlanId(options.planId);
  const payload = {
    transaction: {
      account_id: options.accountId,
      date: options.date,
      amount: options.amount,
      payee_id: options.payeeId ?? null,
      payee_name: options.payeeName ?? null,
      category_id: options.categoryId ?? null,
      memo: options.memo ?? null,
      approved: options.approved ?? false,
      cleared: options.cleared ?? 'uncleared',
      import_id: options.importId ?? null,
    },
  };

  const data = await ynabRequest<{
    transaction: YnabTransaction;
    duplicate_import_ids?: string[];
  }>(`/plans/${resolved}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    planId: resolved,
    transaction: data.transaction,
    duplicateImportIds: data.duplicate_import_ids ?? [],
  };
}
