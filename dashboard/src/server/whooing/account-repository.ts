import { query } from "@/lib/db/postgres";
import { getAccountDisplayName } from "@/lib/account-display-name";

export type WhooingLedgerAccountType = "assets" | "liabilities" | "capital" | "expenses" | "income";

export interface WhooingLedgerAccount {
  accountType: WhooingLedgerAccountType;
  accountId: string;
  title: string;
}

interface AccountDbRow {
  account_type: WhooingLedgerAccountType;
  account_id: string;
  item_type: "group" | "account";
  title: string;
  category: string | null;
  sort_order: number | null;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

function toAccount(row: AccountDbRow): WhooingLedgerAccount {
  return {
    accountType: row.account_type,
    accountId: row.account_id,
    title: getAccountDisplayName(row.account_type, row.account_id, row.title),
  };
}

function toGroupedExpenseAccounts(rows: AccountDbRow[]): WhooingLedgerAccount[] {
  let groupTitle = "";

  return rows.flatMap((row) => {
    if (row.item_type === "group") {
      groupTitle = row.title;
      return [];
    }

    return [{
      accountType: row.account_type,
      accountId: row.account_id,
      title: groupTitle ? `${groupTitle} / ${row.title}` : row.title,
    }];
  });
}

export async function getLedgerEntryAccounts() {
  const [expenseCategories, assetAccounts, liabilityAccounts, incomeCategories, capitalAccounts] = await Promise.all([
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, category, sort_order
      from whooing.accounts
      where section_id = $1
        and account_type = 'expenses'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, category, sort_order
      from whooing.accounts
      where section_id = $1
        and item_type = 'account'
        and account_type = 'assets'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, category, sort_order
      from whooing.accounts
      where section_id = $1
        and item_type = 'account'
        and account_type = 'liabilities'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, category, sort_order
      from whooing.accounts
      where section_id = $1
        and item_type = 'account'
        and account_type = 'income'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, category, sort_order
      from whooing.accounts
      where section_id = $1
        and item_type = 'account'
        and account_type = 'capital'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
  ]);

  const assetOptions = assetAccounts.rows.map(toAccount);
  const liabilityOptions = liabilityAccounts.rows.map(toAccount);
  const creditCardOptions = liabilityAccounts.rows
    .filter((row) => row.category === "creditcard")
    .map(toAccount);

  return {
    expenseCategories: toGroupedExpenseAccounts(expenseCategories.rows),
    paymentAccounts: [...assetOptions, ...liabilityOptions],
    incomeCategories: incomeCategories.rows.map(toAccount),
    depositAccounts: [...assetOptions, ...liabilityOptions],
    assetAccounts: assetOptions,
    liabilityAccounts: liabilityOptions,
    creditCardAccounts: creditCardOptions,
    capitalAccounts: capitalAccounts.rows.map(toAccount),
  };
}

export async function expenseCategoryExists(accountId: string) {
  const result = await query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from whooing.accounts
      where section_id = $1
        and account_type = 'expenses'
        and item_type = 'account'
        and account_id = $2
    ) as exists
    `,
    [sectionId, accountId],
  );

  return result.rows[0]?.exists ?? false;
}

export async function ledgerPaymentAccountExists(accountType: string, accountId: string) {
  if (accountType !== "assets" && accountType !== "liabilities") {
    return false;
  }

  const result = await query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from whooing.accounts
      where section_id = $1
        and account_type = $2
        and item_type = 'account'
        and account_id = $3
    ) as exists
    `,
    [sectionId, accountType, accountId],
  );

  return result.rows[0]?.exists ?? false;
}

async function ledgerAccountExists(accountType: WhooingLedgerAccountType, accountId: string, category?: string) {
  const result = await query<{ exists: boolean }>(
    `
    select exists (
      select 1
      from whooing.accounts
      where section_id = $1
        and account_type = $2
        and item_type = 'account'
        and account_id = $3
        and ($4::text is null or category = $4)
    ) as exists
    `,
    [sectionId, accountType, accountId, category ?? null],
  );

  return result.rows[0]?.exists ?? false;
}

export async function incomeCategoryExists(accountId: string) {
  return ledgerAccountExists("income", accountId);
}

export async function assetAccountExists(accountId: string) {
  return ledgerAccountExists("assets", accountId);
}

export async function liabilityAccountExists(accountId: string) {
  return ledgerAccountExists("liabilities", accountId);
}

export async function creditCardAccountExists(accountId: string) {
  return ledgerAccountExists("liabilities", accountId, "creditcard");
}

export async function capitalAccountExists(accountId: string) {
  return ledgerAccountExists("capital", accountId);
}
