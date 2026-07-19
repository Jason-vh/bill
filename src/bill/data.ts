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
  /** Monthly target (goal, falling back to this month's budgeted). */
  target: number;
  /** What's left right now (YNAB balance; negative when overspent). */
  left: number;
  overspent: boolean;
  /** Fraction of target spent, clamped to [0, 1]. */
  fraction: number;
};

export type LandingData = {
  monthLabel: string;
  totalLeft: number;
  categories: CategorySummary[];
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
  const goal = category.goal_target ?? 0;
  const target = goal > 0 ? goal : category.budgeted;
  const left = category.balance;
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

async function getJointCategories(): Promise<CategorySummary[]> {
  const { categoryGroups } = await fetchCategoryGroups();
  const group = categoryGroups.find((g) => g.id === billConfig.jointGroupId);
  if (!group) throw new Error(`Joint category group ${billConfig.jointGroupId} not found in budget`);
  return group.categories.filter((c) => !c.deleted && !c.hidden).map(toSummary);
}

export async function getLandingData(): Promise<LandingData> {
  const categories = await getJointCategories();
  return {
    monthLabel: monthLabel(),
    totalLeft: categories.reduce((sum, c) => sum + c.left, 0),
    categories,
  };
}

export async function getCategoryPage(categoryId: string): Promise<CategoryPage | null> {
  const categories = await getJointCategories();
  const category = categories.find((c) => c.id === categoryId);
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
