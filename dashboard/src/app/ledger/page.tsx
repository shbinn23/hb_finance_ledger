import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";

export const dynamic = "force-dynamic";

interface LedgerPageProps {
  searchParams?: Promise<{
    month?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LedgerPage({ searchParams }: LedgerPageProps) {
  const params = await searchParams;
  const model = await getSectionViewModel("ledger", {
    ledgerMonth: firstParam(params?.month),
  });

  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
