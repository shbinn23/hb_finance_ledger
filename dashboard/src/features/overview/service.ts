import { getWhooingOverviewSource } from "@/server/whooing/repository";
import { getMlForecastForOverview } from "@/features/ml/service";
import { buildOverviewViewModel } from "./model";

export async function getOverviewViewModel() {
  const [source, mlForecast] = await Promise.all([
    getWhooingOverviewSource(),
    getMlForecastForOverview(),
  ]);
  return buildOverviewViewModel(source, mlForecast);
}
