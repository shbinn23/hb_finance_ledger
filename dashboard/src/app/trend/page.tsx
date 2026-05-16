import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";
import { parsePeriodQuery } from "@/lib/period-filter";

export const dynamic = "force-dynamic";

interface TrendPageProps {
  searchParams?: Promise<{
    period?: string | string[];
    year?: string | string[];
    quarter?: string | string[];
    month?: string | string[];
  }>;
}

export default async function TrendPage({ searchParams }: TrendPageProps) {
  const params = await searchParams;
  const model = await getSectionViewModel("trend", {
    periodQuery: parsePeriodQuery(params),
  });
  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
