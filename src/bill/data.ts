// Shapes YNAB responses into the view models Bill renders.
// Two upstream calls, both cached: joint categories + the joint account's
// current-month transactions.

import { getAccountTransactions, getCategories } from '../ynab.ts';
import type { YnabCategory } from '../types.ts';
import { cached } from './cache.ts';
import { billConfig } from './config.ts';
import { currentMonthStart, monthLabel } from './dates.ts';

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

export type LandingData = {
  monthLabel: string;
  totalLeft: number;
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
  monthLabel: string;
  transactions: TransactionRow[];
};

const fetchCategoryGroups = cached(billConfig.cacheTtlMs, () => getCategories(billConfig.budgetId));

const fetchJointTransactions = cached(billConfig.cacheTtlMs, () =>
  getAccountTransactions({
    planId: billConfig.budgetId,
    accountId: billConfig.jointAccountId,
    sinceDate: currentMonthStart(),
  }),
);

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

async function getJointGroups(): Promise<GroupSection[]> {
  const { categoryGroups } = await fetchCategoryGroups();
  return billConfig.jointGroupIds.map((groupId) => {
    const group = categoryGroups.find((g) => g.id === groupId);
    if (!group) throw new Error(`Joint category group ${groupId} not found in budget`);
    const categories = group.categories.filter((c) => !c.deleted && !c.hidden).map(toSummary);
    return {
      id: group.id,
      name: displayGroupName(group.name),
      categories,
      totalLeft: categories.reduce((sum, c) => sum + c.left, 0),
    };
  });
}

export async function getLandingData(): Promise<LandingData> {
  const groups = await getJointGroups();
  return {
    monthLabel: monthLabel(),
    totalLeft: groups.reduce((sum, g) => sum + g.totalLeft, 0),
    groups,
  };
}

export async function getCategoryPage(categoryId: string): Promise<CategoryPage | null> {
  const groups = await getJointGroups();
  const category = groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);
  if (!category) return null;

  const { transactions } = await fetchJointTransactions();
  const rows: TransactionRow[] = [];

  for (const txn of transactions) {
    if (txn.deleted) continue;

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

  return { category, monthLabel: monthLabel(), transactions: rows };
}
