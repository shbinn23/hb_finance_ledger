const WHOOING_API_BASE_URL = "https://whooing.com/api";

interface WhooingBillApiAccount {
  account_id?: string;
  money?: number | string;
  start_use_date?: number | string;
  end_use_date?: number | string;
  pay_date?: number | string;
}

interface WhooingBillApiResponse {
  code?: number;
  message?: string;
  results?: {
    aggregate?: {
      accounts?: WhooingBillApiAccount[];
    };
  };
}

export interface WhooingCreditCardBillRow {
  accountId: string;
  amount: number;
  startUseDate: number;
  endUseDate: number;
  payDate: number | null;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required Whooing env var: ${name}`);
  }

  return value;
}

function randomHex(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 16).toString(16)).join("");
}

function whooingApiKey() {
  const appId = requiredEnv("WHOOING_APP_ID");
  const token = requiredEnv("WHOOING_TOKEN");
  const signature = requiredEnv("WHOOING_SIGNATURE");
  const nounce = randomHex(32);
  const timestamp = Math.floor(Date.now() / 1000);

  return `app_id=${appId},token=${token},signature=${signature},nounce=${nounce},timestamp=${timestamp}`;
}

function billMonthParam(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return "";
  return month.replace("-", "");
}

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export async function getWhooingCreditCardBillRows(billMonth: string): Promise<WhooingCreditCardBillRow[]> {
  const monthParam = billMonthParam(billMonth);
  if (!monthParam) return [];

  const params = new URLSearchParams({
    section_id: requiredEnv("WHOOING_SECTION_ID"),
    start_date: monthParam,
    end_date: monthParam,
  });
  const response = await fetch(`${WHOOING_API_BASE_URL}/bill.json?${params.toString()}`, {
    headers: {
      "X-API-KEY": whooingApiKey(),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Whooing bill request failed with status ${response.status}`);
  }

  const payload = await response.json() as WhooingBillApiResponse;
  if (payload.code !== undefined && payload.code !== 200) {
    throw new Error(payload.message ? `Whooing bill request rejected: ${payload.message}` : "Whooing bill request rejected");
  }

  return (payload.results?.aggregate?.accounts ?? [])
    .filter((account) => account.account_id)
    .map((account) => ({
      accountId: account.account_id ?? "",
      amount: numberValue(account.money),
      startUseDate: numberValue(account.start_use_date),
      endUseDate: numberValue(account.end_use_date),
      payDate: account.pay_date === undefined || account.pay_date === null ? null : numberValue(account.pay_date),
    }));
}
