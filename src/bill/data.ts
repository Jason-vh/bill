// Shapes YNAB responses into the view models Bill renders.
// Two upstream calls, both cached: joint categories + the joint account's
// current-month transactions.

import { getAccountTransactions, getAccounts, getMonthCategories, getPlan } from '../ynab.ts';
import type { YnabCategory } from '../types.ts';
import { cached, cachedBy } from './cache.ts';
import { billConfig } from './config.ts';
import { addMonths, currentMonthKey, isMonthKey, monthLabel, monthStartDate } from './dates.ts';

export type CategorySummary = {
  id: string;
  name: string;
  /** Money spent this month (non-negative milliunits). */
  spent: number;
  /** Total available this period (spent + left = carryover + budgeted). */
  target: number;
  /** What's left right now (YNAB balance; negative when overspent). */
  left: number;
  overspent: boolean;
  /** Fraction of target spent, clamped to [0, 1]. */
  fraction: number;
};

export type GroupSection = {
  id: string;
  /** Display label (the YNAB group name, minus any "joint:" prefix). */
  name: string;
  categories: CategorySummary[];
  /** Sum of this group's categories' balances. */
  totalLeft: number;
};

/** Month selector state: the chosen month plus adjacent keys to page to (null = at a bound). */
export type MonthNav = {
  key: string;
  label: string;
  prev: string | null;
  next: string | null;
};

/** The joint bank account's live balance (only shown for the current month). */
export type AccountBalance = {
  name: string;
  /** Signed milliunits (YNAB working balance). */
  balance: number;
};

export type LandingData = {
  nav: MonthNav;
  totalLeft: number;
  /** Joint account balance, or null when viewing a past month. */
  account: AccountBalance | null;
  groups: GroupSection[];
};

export type TransactionRow = {
  payee: string;
  date: string;
  /** Signed milliunits (negative for spending). */
  amount: number;
};

export type CategoryPage = {
  category: CategorySummary;
  nav: MonthNav;
  transactions: TransactionRow[];
};

// Per-month caches: each month key gets its own TTL entry so paging between
// months never refetches a month that's already warm.
const fetchMonthCategories = cachedBy(billConfig.cacheTtlMs, (month) =>
  getMonthCategories(billConfig.budgetId, monthStartDate(month)),
);

const fetchMonthTransactions = cachedBy(billConfig.cacheTtlMs, (month) =>
  getAccountTransactions({
    planId: billConfig.budgetId,
    accountId: billConfig.jointAccountId,
    sinceDate: monthStartDate(month),
  }),
);

const fetchPlan = cached(billConfig.cacheTtlMs, () => getPlan(billConfig.budgetId));

const fetchAccounts = cached(billConfig.cacheTtlMs, () => getAccounts(billConfig.budgetId));

/** The configured joint account's live balance, or null if it can't be found. */
async function jointAccount(): Promise<AccountBalance | null> {
  const { accounts } = await fetchAccounts();
  const account = accounts.find((a) => a.id === billConfig.jointAccountId && !a.deleted);
  return account ? { name: account.name, balance: account.balance } : null;
}

/** Plan's earliest budgeted month as a key ("YYYY-MM"), falling back to `fallback`. */
async function firstMonthKey(fallback: string): Promise<string> {
  const plan = await fetchPlan();
  return plan?.first_month ? plan.first_month.slice(0, 7) : fallback;
}

/** Clamp a requested month key into [plan first month, current month]. */
async function resolveMonth(requested?: string): Promise<string> {
  const current = currentMonthKey();
  let month = requested && isMonthKey(requested) ? requested : current;
  if (month > current) month = current;
  const first = await firstMonthKey(month);
  if (month < first) month = first;
  return month;
}

async function buildNav(month: string): Promise<MonthNav> {
  const current = currentMonthKey();
  const first = await firstMonthKey(month);
  return {
    key: month,
    label: monthLabel(month),
    prev: month > first ? addMonths(month, -1) : null,
    next: month < current ? addMonths(month, 1) : null,
  };
}

function toSummary(category: YnabCategory): CategorySummary {
  const spent = Math.max(0, -category.activity);
  const left = category.balance;
  // The envelope available this period: what's been spent plus what remains.
  // Keeps the progress bar and "left" consistent even with carryover balances.
  const target = spent + left;
  return {
    id: category.id,
    name: category.name,
    spent,
    target,
    left,
    overspent: left < 0,
    fraction: target > 0 ? Math.min(1, spent / target) : spent > 0 ? 1 : 0,
  };
}

/** "joint: bills" -> "bills"; leaves un-prefixed names untouched. */
function displayGroupName(name: string): string {
  const colon = name.indexOf(':');
  return (colon >= 0 ? name.slice(colon + 1) : name).trim();
}

async function getJointGroups(month: string): Promise<GroupSection[]> {
  const { categories } = await fetchMonthCategories(month);
  return billConfig.jointGroupIds.map((groupId) => {
    const inGroup = categories.filter((c) => c.category_group_id === groupId && !c.deleted);
    if (inGroup.length === 0) throw new Error(`Joint category group ${groupId} not found for ${month}`);
    const visible = inGroup.filter((c) => !c.hidden).map(toSummary);
    return {
      id: groupId,
      name: displayGroupName(inGroup[0].category_group_name),
      categories: visible,
      totalLeft: visible.reduce((sum, c) => sum + c.left, 0),
    };
  });
}

export async function getLandingData(requestedMonth?: string): Promise<LandingData> {
  const month = await resolveMonth(requestedMonth);
  const isCurrent = month === currentMonthKey();
  const [groups, nav, account] = await Promise.all([
    getJointGroups(month),
    buildNav(month),
    isCurrent ? jointAccount() : Promise.resolve(null),
  ]);
  return {
    nav,
    totalLeft: groups.reduce((sum, g) => sum + g.totalLeft, 0),
    account,
    groups,
  };
}

/**
 * Prime the current-month caches (categories, plan, account) so the first
 * visitor after startup — or after a TTL lapse — hits warm data instead of
 * blocking on YNAB. Safe to call on an interval.
 */
export async function warmCache(): Promise<void> {
  await getLandingData();
}

export async function getCategoryPage(categoryId: string, requestedMonth?: string): Promise<CategoryPage | null> {
  const month = await resolveMonth(requestedMonth);
  const groups = await getJointGroups(month);
  const category = groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  if (!category) return null;

  const { transactions } = await fetchMonthTransactions(month);
  // since_date only bounds the lower edge, so drop anything from later months.
  const nextMonthStart = monthStartDate(addMonths(month, 1));
  const rows: TransactionRow[] = [];

  for (const txn of transactions) {
    if (txn.deleted) continue;
    if (txn.date >= nextMonthStart) continue;

    if (txn.subtransactions && txn.subtransactions.length > 0) {
      for (const sub of txn.subtransactions) {
        if (sub.deleted || sub.category_id !== categoryId) continue;
        rows.push({
          payee: sub.payee_name ?? txn.payee_name ?? 'Unknown',
          date: txn.date,
          amount: sub.amount,
        });
      }
    } else if (txn.category_id === categoryId) {
      rows.push({
        payee: txn.payee_name ?? 'Unknown',
        date: txn.date,
        amount: txn.amount,
      });
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));

  return { category, nav: await buildNav(month), transactions: rows };
}
