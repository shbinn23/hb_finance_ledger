function moneyNumber(value: number | null | undefined): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
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
