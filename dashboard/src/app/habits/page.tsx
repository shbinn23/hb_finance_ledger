import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";
import { parsePeriodQuery } from "@/lib/period-filter";

export const dynamic = "force-dynamic";

interface HabitsPageProps {
  searchParams?: Promise<{
    period?: string | string[];
    year?: string | string[];
    quarter?: string | string[];
    month?: string | string[];
  }>;
}

export default async function HabitsPage({ searchParams }: HabitsPageProps) {
  const params = await searchParams;
  const model = await getSectionViewModel("habits", {
    periodQuery: parsePeriodQuery(params),
  });
  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
