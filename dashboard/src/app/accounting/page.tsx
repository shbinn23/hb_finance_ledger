import { Shell } from "@/components/layout/shell";
import { AccountingPage } from "@/features/accounting/components/accounting-page";
import { getAccountingViewModel } from "@/features/accounting/service";
import { parsePeriodQuery } from "@/lib/period-filter";

export const dynamic = "force-dynamic";

interface AccountingPageProps {
  searchParams?: Promise<{
    period?: string | string[];
    year?: string | string[];
    quarter?: string | string[];
    month?: string | string[];
  }>;
}

export default async function Page({ searchParams }: AccountingPageProps) {
  const params = await searchParams;
  const model = await getAccountingViewModel({
    periodQuery: parsePeriodQuery(params),
  });

  return (
    <Shell>
      <AccountingPage model={model} />
    </Shell>
  );
}
