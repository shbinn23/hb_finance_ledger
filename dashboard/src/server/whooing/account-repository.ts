import { query } from "@/lib/db/postgres";

export type WhooingLedgerAccountType = "assets" | "liabilities" | "expenses";

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
  sort_order: number | null;
}

const sectionId = process.env.WHOOING_SECTION_ID ?? "s152045";

function toAccount(row: AccountDbRow): WhooingLedgerAccount {
  return {
    accountType: row.account_type,
    accountId: row.account_id,
    title: row.title,
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

export async function getSlackLedgerEntryAccounts() {
  const [expenseCategories, paymentAccounts] = await Promise.all([
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, sort_order
      from whooing.accounts
      where section_id = $1
        and account_type = 'expenses'
      order by sort_order nulls last, title
      `,
      [sectionId],
    ),
    query<AccountDbRow>(
      `
      select account_type, account_id, item_type, title, sort_order
      from whooing.accounts
      where section_id = $1
        and item_type = 'account'
        and account_type in ('assets', 'liabilities')
      order by account_type, sort_order nulls last, title
      `,
      [sectionId],
    ),
  ]);

  return {
    expenseCategories: toGroupedExpenseAccounts(expenseCategories.rows),
    paymentAccounts: paymentAccounts.rows.map(toAccount),
  };
}
