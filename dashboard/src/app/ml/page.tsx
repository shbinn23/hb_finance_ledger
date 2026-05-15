import { Shell } from "@/components/layout/shell";
import { MlPage } from "@/features/ml/components/ml-page";
import { getMlInsightsViewModel } from "@/features/ml/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const model = await getMlInsightsViewModel();
  return (
    <Shell>
      <MlPage model={model} />
    </Shell>
  );
}
