export type YnabPlanSummary = {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
  date_format?: { format: string };
  currency_format?: {
    iso_code: string;
    example_format: string;
    decimal_digits: number;
    decimal_separator: string;
    symbol_first: boolean;
    group_separator: string;
    currency_symbol: string;
    display_symbol: boolean;
  };
};

export type YnabAccount = {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  closed: boolean;
  deleted: boolean;
  note: string | null;
  balance: number;
  balance_formatted?: string;
  balance_currency?: number;
  cleared_balance: number;
  uncleared_balance: number;
  transfer_payee_id: string | null;
};

export type YnabCategory = {
  id: string;
  category_group_id: string;
  category_group_name: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  note: string | null;
  budgeted: number;
  budgeted_formatted?: string;
  budgeted_currency?: number;
  activity: number;
  activity_formatted?: string;
  activity_currency?: number;
  balance: number;
  balance_formatted?: string;
  balance_currency?: number;
  goal_type?: string | null;
  goal_target?: number | null;
  goal_overall_left?: number | null;
  goal_percentage_complete?: number | null;
};

export type YnabSubTransaction = {
  id: string;
  transaction_id: string;
  amount: number;
  memo: string | null;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
};

export type YnabCategoryGroup = {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: YnabCategory[];
};

export type YnabTransaction = {
  id: string;
  date: string;
  amount: number;
  amount_formatted?: string;
  amount_currency?: number;
  memo: string | null;
  cleared: string;
  approved: boolean;
  flag_color: string | null;
  flag_name?: string | null;
  account_id: string;
  account_name: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  matched_transaction_id: string | null;
  import_id: string | null;
  import_payee_name?: string | null;
  import_payee_name_original?: string | null;
  debt_transaction_type?: string | null;
  deleted: boolean;
  subtransactions?: YnabSubTransaction[];
};
