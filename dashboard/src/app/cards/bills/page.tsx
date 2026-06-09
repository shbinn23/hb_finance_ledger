import { Shell } from "@/components/layout/shell";
import { CardsPage } from "@/features/cards/components/cards-page";
import { getCardsViewModel } from "@/features/cards/service";

export const dynamic = "force-dynamic";

export default async function Page() {
  const model = await getCardsViewModel();

  return (
    <Shell>
      <CardsPage model={model} view="bills" />
    </Shell>
  );
}
