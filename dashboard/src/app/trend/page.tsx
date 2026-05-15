import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";

export const dynamic = "force-dynamic";

export default async function TrendPage() {
  const model = await getSectionViewModel("trend");
  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
