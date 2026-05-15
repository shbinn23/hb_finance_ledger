import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  const model = await getSectionViewModel("analysis");
  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
