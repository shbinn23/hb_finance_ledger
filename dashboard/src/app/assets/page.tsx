import { Shell } from "@/components/layout/shell";
import { SectionPage } from "@/features/sections/components/section-page";
import { getSectionViewModel } from "@/features/sections/service";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const model = await getSectionViewModel("assets");
  return (
    <Shell>
      <SectionPage model={model} />
    </Shell>
  );
}
