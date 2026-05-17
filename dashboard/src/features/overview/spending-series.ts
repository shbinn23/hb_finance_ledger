import type { SpendingPoint } from "./types";

interface ForecastSeriesPoint {
  day: number;
  ai: number | null;
  projected: number | null;
  upper: number | null;
  lower: number | null;
}

interface ForecastLike {
  today?: string;
  series: ForecastSeriesPoint[];
}

function cumulative(points: Array<{ day: number; amount: number }>) {
  let total = 0;
  return [...points]
    .sort((a, b) => a.day - b.day)
    .map((point) => {
      total += point.amount;
      return { day: point.day, amount: total };
    });
}

function projectMonthEnd(current: number, lastDay: number, monthDays = 31) {
  if (lastDay <= 0) return 0;
  return Math.round((current / lastDay) * monthDays);
}

function dayFromIsoDate(value?: string) {
  const match = value?.match(/^\d{4}-\d{2}-(\d{2})$/);
  return match ? Number(match[1]) : null;
}

function resolveObservedDay(forecast: ForecastLike, lastTransactionDay: number, monthDays: number) {
  const today = dayFromIsoDate(forecast.today);
  const observedDay = Math.max(lastTransactionDay, today ?? lastTransactionDay);
  return Math.min(Math.max(observedDay, 0), monthDays);
}

function carryActualByDay(actual: Array<{ day: number; amount: number }>, observedDay: number) {
  const byDay = new Map<number, number>();
  let cursor = 0;
  let runningTotal = 0;

  for (let day = 1; day <= observedDay; day += 1) {
    while (cursor < actual.length && actual[cursor].day <= day) {
      runningTotal = actual[cursor].amount;
      cursor += 1;
    }
    byDay.set(day, runningTotal);
  }

  return byDay;
}

export function buildSpendingSeries(
  dailyExpenses: Array<{ day: number; amount: number }>,
  baseline: Array<{ day: number; amount: number }>,
  mlForecast?: ForecastLike | null,
): SpendingPoint[] {
  const actual = cumulative(dailyExpenses);
  const baselineByDay = new Map(cumulative(baseline).map((point) => [point.day, point.amount]));
  const last = actual.at(-1);
  const lastDay = last?.day ?? 0;

  if (mlForecast) {
    const monthDays = mlForecast.series.at(-1)?.day ?? 31;
    const observedDay = resolveObservedDay(mlForecast, lastDay, monthDays);
    const actualByDay = carryActualByDay(actual, observedDay);
    const mlByDay = new Map(mlForecast.series.map((point) => [point.day, point.projected]));
    const actualAtObservedDay = observedDay > 0 ? actualByDay.get(observedDay) ?? null : null;
    const mlAtObservedDay = observedDay > 0 ? mlByDay.get(observedDay) ?? null : null;

    return mlForecast.series.map((point) => ({
      day: point.day,
      actual: point.day <= observedDay ? actualByDay.get(point.day) ?? 0 : null,
      actualProjection: actualAtObservedDay !== null
        && mlAtObservedDay !== null
        && point.projected !== null
        && point.day >= observedDay
          ? Math.round(actualAtObservedDay + (point.projected - mlAtObservedDay))
          : null,
      projected: point.projected,
      baseline: baselineByDay.get(point.day) ?? null,
      ai: point.ai,
      upper: point.upper,
      lower: point.lower,
    }));
  }

  const actualByDay = carryActualByDay(actual, lastDay);
  const projectedFinal = projectMonthEnd(last?.amount ?? 0, lastDay);
  const projected: SpendingPoint[] = [];

  for (let day = Math.max(lastDay, 1); day <= 31; day += day === lastDay ? 3 : 3) {
    const ratio = day / 31;
    const amount = Math.round(projectedFinal * ratio);
    projected.push({
      day,
      actual: day <= lastDay ? actualByDay.get(day) ?? 0 : null,
      actualProjection: null,
      projected: amount,
      baseline: baselineByDay.get(day) ?? null,
      upper: Math.round(amount * 1.07),
      lower: Math.round(amount * 0.93),
    });
  }

  const byDay = new Map<number, SpendingPoint>();
  for (let day = 1; day <= lastDay; day += 1) {
    byDay.set(day, {
      day,
      actual: actualByDay.get(day) ?? 0,
      actualProjection: null,
      projected: null,
      baseline: baselineByDay.get(day) ?? null,
      upper: null,
      lower: null,
    });
  }
  projected.forEach((point) => {
    byDay.set(point.day, { ...byDay.get(point.day), ...point });
  });
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function projectSpendingMonthEnd(current: number, lastDay: number, monthDays = 31) {
  return projectMonthEnd(current, lastDay, monthDays);
}
