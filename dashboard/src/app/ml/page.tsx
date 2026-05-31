import { Shell } from "@/components/layout/shell";
import { MlPage } from "@/features/ml/components/ml-page";
import { getMlInsightsViewModel } from "@/features/ml/service";
import { parsePeriodQuery } from "@/lib/period-filter";

export const dynamic = "force-dynamic";

interface MlPageProps {
  searchParams?: Promise<{
    period?: string | string[];
    year?: string | string[];
    quarter?: string | string[];
    month?: string | string[];
  }>;
}

export default async function Page({ searchParams }: MlPageProps) {
  const params = await searchParams;
  const model = await getMlInsightsViewModel({
    periodQuery: parsePeriodQuery(params),
  });
  return (
    <Shell>
      <MlPage model={model} />
    </Shell>
  );
}
