import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { asJsonText, includesCi, truncateText } from './formatting.ts';
import { createTransaction, getAccounts, getCategories, getTransactions, listPlans, resolvePlanId } from './ynab.ts';

function result(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: truncateText(asJsonText(data)) }],
  };
}

function parseAmountToMilliunits(input: string | number): number {
  const normalized = typeof input === 'number' ? String(input) : input.trim().replace(/[,$€£\s]/g, '');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount: ${input}`);
  }
  return Math.round(amount * 1000);
}

function makeImportId(parts: Array<string | number | boolean | null | undefined>): string {
  const canonical = parts.map((part) => String(part ?? '')).join('|');
  return `MCP:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

function resolveByIdOrName<T extends { id: string; name: string }>(
  items: T[],
  kind: string,
  id?: string,
  name?: string,
): T | undefined {
  if (id) {
    const found = items.find((item) => item.id === id);
    if (!found) throw new Error(`Unknown ${kind} id: ${id}`);
    return found;
  }

  if (!name) return undefined;

  const exact = items.filter((item) => item.name.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(`Ambiguous ${kind} name "${name}"; multiple exact matches found`);
  }

  const partial = items.filter((item) => item.name.toLowerCase().includes(name.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) throw new Error(`No ${kind} matched name: ${name}`);

  throw new Error(`Ambiguous ${kind} name "${name}"; matches: ${partial.slice(0, 8).map((item) => `${item.name} (${item.id})`).join(', ')}`);
}

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'ynab-mcp',
      version: '0.2.0',
    },
    {
      instructions:
        'Read-only YNAB MCP server. Use it to inspect budgets, accounts, categories, and transactions. Do not assume write tools exist; this server intentionally avoids mutating the budget.',
    },
  );

  server.registerTool(
    'list_budgets',
    {
      title: 'List budgets',
      description: 'List YNAB budgets/plans available for the configured token.',
      inputSchema: z.object({}).optional(),
    },
    async () => {
      const { plans, defaultPlan } = await listPlans();
      return result({
        defaultBudgetId: defaultPlan?.id ?? null,
        budgets: plans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          firstMonth: plan.first_month,
          lastMonth: plan.last_month,
          lastModifiedOn: plan.last_modified_on,
          currency: plan.currency_format?.iso_code ?? null,
        })),
      });
    },
  );

  server.registerTool(
    'get_budget_overview',
    {
      title: 'Get budget overview',
      description: 'Summarize a budget without making any changes.',
      inputSchema: z.object({
        budgetId: z.string().optional().describe('Optional YNAB budget/plan ID. Defaults to configured or default budget.'),
      }),
    },
    async ({ budgetId }) => {
      const planId = await resolvePlanId(budgetId);
      const [{ accounts }, { categoryGroups }] = await Promise.all([getAccounts(planId), getCategories(planId)]);

      const activeAccounts = accounts.filter((account) => !account.deleted && !account.closed);
      const onBudgetAccounts = activeAccounts.filter((account) => account.on_budget);
      const overspentCategories = categoryGroups
        .flatMap((group) => group.categories)
        .filter((category) => !category.deleted && !category.hidden && category.balance < 0)
        .sort((a, b) => a.balance - b.balance)
        .slice(0, 10)
        .map((category) => ({
          id: category.id,
          group: category.category_group_name,
          name: category.name,
          balance: category.balance,
          balanceFormatted: category.balance_formatted ?? null,
        }));

      return result({
        budgetId: planId,
        accountSummary: {
          activeAccountCount: activeAccounts.length,
          onBudgetAccountCount: onBudgetAccounts.length,
          totalOnBudgetBalance: onBudgetAccounts.reduce((sum, account) => sum + account.balance, 0),
        },
        overspentCategories,
      });
    },
  );

  server.registerTool(
    'list_accounts',
    {
      title: 'List accounts',
      description: 'List YNAB accounts for a budget.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        includeClosed: z.boolean().default(false),
      }),
    },
    async ({ budgetId, includeClosed }) => {
      const { planId, accounts } = await getAccounts(budgetId);
      const filtered = accounts
        .filter((account) => !account.deleted)
        .filter((account) => includeClosed || !account.closed)
        .map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          onBudget: account.on_budget,
          closed: account.closed,
          balance: account.balance,
          balanceFormatted: account.balance_formatted ?? null,
          clearedBalance: account.cleared_balance,
          unclearedBalance: account.uncleared_balance,
        }));

      return result({ budgetId: planId, accountCount: filtered.length, accounts: filtered });
    },
  );

  server.registerTool(
    'list_categories',
    {
      title: 'List categories',
      description: 'List category groups and categories for a budget.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        includeHidden: z.boolean().default(false),
      }),
    },
    async ({ budgetId, includeHidden }) => {
      const { planId, categoryGroups } = await getCategories(budgetId);
      const groups = categoryGroups
        .filter((group) => !group.deleted)
        .map((group) => ({
          id: group.id,
          name: group.name,
          categories: group.categories
            .filter((category) => !category.deleted)
            .filter((category) => includeHidden || !category.hidden)
            .map((category) => ({
              id: category.id,
              name: category.name,
              balance: category.balance,
              balanceFormatted: category.balance_formatted ?? null,
              budgeted: category.budgeted,
              budgetedFormatted: category.budgeted_formatted ?? null,
              activity: category.activity,
              activityFormatted: category.activity_formatted ?? null,
              hidden: category.hidden,
            })),
        }))
        .filter((group) => group.categories.length > 0);

      return result({ budgetId: planId, categoryGroupCount: groups.length, groups });
    },
  );

  server.registerTool(
    'list_transactions',
    {
      title: 'List transactions',
      description:
        'List normal YNAB transactions (approved or unapproved) with optional filters. Use this for a full transaction list, not just pending items. This tool is read-only.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        sinceDate: z.string().optional().describe('ISO date like 2026-04-01'),
        accountName: z.string().optional(),
        payeeName: z.string().optional(),
        categoryName: z.string().optional(),
        approved: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async ({ budgetId, sinceDate, accountName, payeeName, categoryName, approved, limit }) => {
      const { planId, transactions } = await getTransactions({ planId: budgetId, sinceDate });
      const filtered = transactions
        .filter((transaction) => !transaction.deleted)
        .filter((transaction) => includesCi(transaction.account_name, accountName))
        .filter((transaction) => includesCi(transaction.payee_name, payeeName))
        .filter((transaction) => includesCi(transaction.category_name, categoryName))
        .filter((transaction) => approved === undefined || transaction.approved === approved)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          amountFormatted: transaction.amount_formatted ?? null,
          accountName: transaction.account_name,
          payeeName: transaction.payee_name,
          categoryName: transaction.category_name,
          memo: transaction.memo,
          approved: transaction.approved,
          cleared: transaction.cleared,
          transferAccountId: transaction.transfer_account_id,
        }));

      return result({ budgetId: planId, transactionCount: filtered.length, transactions: filtered });
    },
  );

  server.registerTool(
    'get_recent_transactions',
    {
      title: 'Get recent transactions',
      description:
        'List the most recent normal YNAB transactions. Use this when you want a regular transaction feed, not just unapproved items.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        sinceDate: z.string().optional().describe('Optional ISO date like 2026-04-01'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ budgetId, sinceDate, limit }) => {
      const { planId, transactions } = await getTransactions({ planId: budgetId, sinceDate });
      const filtered = transactions
        .filter((transaction) => !transaction.deleted)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          amountFormatted: transaction.amount_formatted ?? null,
          accountName: transaction.account_name,
          payeeName: transaction.payee_name,
          categoryName: transaction.category_name,
          memo: transaction.memo,
          approved: transaction.approved,
          cleared: transaction.cleared,
        }));

      return result({ budgetId: planId, transactionCount: filtered.length, transactions: filtered });
    },
  );

  server.registerTool(
    'search_transactions',
    {
      title: 'Search transactions',
      description:
        'Search across regular YNAB transactions by matching a query against account, payee, category, and memo. Use this when the user wants specific transactions, not just pending ones.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        query: z.string().min(1),
        sinceDate: z.string().optional().describe('Optional ISO date like 2026-04-01'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ budgetId, query, sinceDate, limit }) => {
      const needle = query.toLowerCase();
      const { planId, transactions } = await getTransactions({ planId: budgetId, sinceDate });
      const filtered = transactions
        .filter((transaction) => !transaction.deleted)
        .filter((transaction) => {
          const haystacks = [
            transaction.account_name,
            transaction.payee_name,
            transaction.category_name,
            transaction.memo,
          ];
          return haystacks.some((value) => (value ?? '').toLowerCase().includes(needle));
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          amountFormatted: transaction.amount_formatted ?? null,
          accountName: transaction.account_name,
          payeeName: transaction.payee_name,
          categoryName: transaction.category_name,
          memo: transaction.memo,
          approved: transaction.approved,
          cleared: transaction.cleared,
        }));

      return result({ budgetId: planId, query, transactionCount: filtered.length, transactions: filtered });
    },
  );

  server.registerTool(
    'get_unapproved_transactions',
    {
      title: 'Get unapproved transactions',
      description: 'List unapproved YNAB transactions for review.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    },
    async ({ budgetId, limit }) => {
      const { planId, transactions } = await getTransactions({ planId: budgetId, type: 'unapproved' });
      const filtered = transactions
        .filter((transaction) => !transaction.deleted)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, limit)
        .map((transaction) => ({
          id: transaction.id,
          date: transaction.date,
          amount: transaction.amount,
          amountFormatted: transaction.amount_formatted ?? null,
          accountName: transaction.account_name,
          payeeName: transaction.payee_name,
          categoryName: transaction.category_name,
          memo: transaction.memo,
          approved: transaction.approved,
        }));

      return result({ budgetId: planId, unapprovedCount: filtered.length, transactions: filtered });
    },
  );

  server.registerTool(
    'create_transaction',
    {
      title: 'Create transaction',
      description:
        'Create a YNAB transaction. Safe by default: this previews the transaction unless commit is explicitly set to true.',
      inputSchema: z.object({
        budgetId: z.string().optional(),
        accountId: z.string().optional(),
        accountName: z.string().optional(),
        date: z.string().describe('ISO date like 2026-04-25'),
        amount: z.union([z.number(), z.string()]).describe('Currency amount in major units. Use negative for spending, positive for inflow.'),
        payeeName: z.string().optional(),
        categoryId: z.string().optional(),
        categoryName: z.string().optional(),
        memo: z.string().max(500).optional(),
        approved: z.boolean().default(false),
        cleared: z.enum(['cleared', 'uncleared', 'reconciled']).default('uncleared'),
        commit: z.boolean().default(false).describe('Must be true to actually create the transaction. Defaults to preview-only.'),
        dedupe: z.boolean().default(true).describe('When true, attach a deterministic import_id to reduce accidental duplicate creations.'),
      }),
    },
    async ({ budgetId, accountId, accountName, date, amount, payeeName, categoryId, categoryName, memo, approved, cleared, commit, dedupe }) => {
      const planId = await resolvePlanId(budgetId);
      const [{ accounts }, { categoryGroups }] = await Promise.all([getAccounts(planId), getCategories(planId)]);

      const account = resolveByIdOrName(
        accounts.filter((item) => !item.deleted && !item.closed),
        'account',
        accountId,
        accountName,
      );
      if (!account) throw new Error('Either accountId or accountName is required');

      const allCategories = categoryGroups.flatMap((group) =>
        group.categories
          .filter((item) => !item.deleted)
          .map((item) => ({ id: item.id, name: item.name, groupName: item.category_group_name })),
      );
      const category = resolveByIdOrName(allCategories, 'category', categoryId, categoryName);
      const amountMilliunits = parseAmountToMilliunits(amount);
      const importId = dedupe
        ? makeImportId([planId, account.id, date, amountMilliunits, payeeName, category?.id, memo, approved, cleared])
        : undefined;

      const preview = {
        budgetId: planId,
        previewOnly: !commit,
        resolved: {
          account: { id: account.id, name: account.name },
          category: category ? { id: category.id, name: category.name, groupName: category.groupName } : null,
        },
        transaction: {
          accountId: account.id,
          date,
          amountMilliunits,
          payeeName: payeeName ?? null,
          categoryId: category?.id ?? null,
          memo: memo ?? null,
          approved,
          cleared,
          importId: importId ?? null,
        },
        note: commit
          ? 'commit=true, so the transaction will be created.'
          : 'Preview only. Set commit=true to actually create the transaction.',
      };

      if (!commit) {
        return result(preview);
      }

      const created = await createTransaction({
        planId,
        accountId: account.id,
        date,
        amount: amountMilliunits,
        payeeName,
        categoryId: category?.id,
        memo,
        approved,
        cleared,
        importId,
      });

      return result({
        ...preview,
        previewOnly: false,
        createdTransaction: {
          id: created.transaction.id,
          date: created.transaction.date,
          amount: created.transaction.amount,
          amountFormatted: created.transaction.amount_formatted ?? null,
          accountName: created.transaction.account_name,
          payeeName: created.transaction.payee_name,
          categoryName: created.transaction.category_name,
          memo: created.transaction.memo,
          approved: created.transaction.approved,
        },
        duplicateImportIds: created.duplicateImportIds,
      });
    },
  );

  return server;
}
