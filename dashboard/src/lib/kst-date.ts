const kstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface KstDateParts {
  year: string;
  month: string;
  day: string;
}

export function todayKstDateParts(now = new Date()): KstDateParts {
  const parts = Object.fromEntries(
    kstFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );

  return {
    year: String(parts.year),
    month: String(parts.month),
    day: String(parts.day),
  };
}

export function currentKstDateValue(now = new Date()): number {
  const parts = todayKstDateParts(now);
  return Number(`${parts.year}${parts.month}${parts.day}`);
}

export function currentKstMonthValue(now = new Date()): string {
  const parts = todayKstDateParts(now);
  return `${parts.year}-${parts.month}`;
}

export function currentKstYearValue(now = new Date()): string {
  return todayKstDateParts(now).year;
}

export function currentKstQuarterValue(now = new Date()): string {
  const month = Number(todayKstDateParts(now).month);
  return String(Math.floor((month - 1) / 3) + 1);
}

export function currentKstDay(now = new Date()): number {
  return Number(todayKstDateParts(now).day);
}
