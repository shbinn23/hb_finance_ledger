function moneyNumber(value: number | null | undefined): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function stringDateParts(value: string) {
  const compact = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return { year: compact[1], month: compact[2], day: compact[3] };

  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return { year: isoDate[1], month: isoDate[2], day: isoDate[3] };

  const dotted = value.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (dotted) return { year: dotted[1], month: dotted[2], day: dotted[3] };

  return null;
}

export function won(value: number | null | undefined): string {
  return `${Math.round(moneyNumber(value)).toLocaleString("ko-KR")}원`;
}

export function wonOrDash(value: unknown): string {
  if (value === null || value === undefined) return "-";

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";

  return won(numberValue);
}

export function wonMan(value: number | null | undefined): string {
  return `${Math.round(moneyNumber(value) / 10_000).toLocaleString("ko-KR")}만`;
}

export function wonCompact(value: number | null | undefined): string {
  return won(value);
}

export function formatDisplayDate(value: Date | string | null | undefined): string {
  if (!value) return "-";

  const parts = value instanceof Date ? dateParts(value) : stringDateParts(value);
  if (!parts?.year || !parts.month || !parts.day) return String(value);

  return `${parts.year}.${parts.month}.${parts.day}`;
}

export function formatDisplayDateTime(value: Date | null | undefined): string {
  if (!value) return "-";

  const parts = dateParts(value);
  if (!parts.year || !parts.month || !parts.day || !parts.hour || !parts.minute) return "-";

  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
}
