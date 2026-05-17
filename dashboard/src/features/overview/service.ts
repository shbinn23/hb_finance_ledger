import { getWhooingOverviewSource } from "@/server/whooing/repository";
import { getMlForecastForOverview } from "@/features/ml/service";
import { getFixedExpenseSchedule } from "@/server/whooing/analytics-repository";
import { buildFixedExpenseSchedule, referenceDayForMonth } from "@/lib/financial-analysis/fixed-expense-schedule";
import { buildOverviewViewModel } from "./model";

export async function getOverviewViewModel() {
  const [source, mlForecast, fixedExpenseSource] = await Promise.all([
    getWhooingOverviewSource(),
    getMlForecastForOverview(),
    getFixedExpenseSchedule(),
  ]);
  const fixedExpenseSchedule = buildFixedExpenseSchedule(
    fixedExpenseSource.rows,
    referenceDayForMonth(fixedExpenseSource.targetMonth),
  );
  return buildOverviewViewModel(source, mlForecast, fixedExpenseSchedule);
}
