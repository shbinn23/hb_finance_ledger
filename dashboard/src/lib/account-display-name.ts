const accountDisplayNames: Record<string, string> = {
  "assets:x30": "우리 Npay",
  "assets:x35": "네이버 CMA",
  "assets:x36": "우리 CMA",
  "assets:x38": "아이오닉 하이브리드",
  "liabilities:x22": "우리 SKT",
  "liabilities:x43": "우리 Olleh",
  "liabilities:x44": "현대 제로",
  "liabilities:x45": "하나 MG+S",
  "liabilities:x46": "BC Goat",
  "liabilities:x47": "우리 카드의정석2",
  "liabilities:x48": "하나 스마트애니",
  "liabilities:x49": "삼성 행복",
  "liabilities:x50": "신한 레이디",
  "liabilities:x51": "롯데 라이킷",
  "liabilities:x52": "신한 밥친구",
  "liabilities:x53": "농협 플렉스",
  "liabilities:x54": "BC 케이퍼스트",
  "liabilities:x55": "국민 CJ",
  "liabilities:x56": "국민 톡톡",
  "liabilities:x91": "우체국 개이득",
  "liabilities:x92": "새마을 더나은",
  "liabilities:x93": "국민 나사카",
  "liabilities:x94": "신한 하이패스",
  "liabilities:x95": "하나 나사카",
  "liabilities:x96": "우리 SKT(구)",
};

export function getAccountDisplayKey(accountType: string, accountId: string): string {
  return `${accountType}:${accountId}`;
}

export function getAccountDisplayName(
  accountType: string,
  accountId: string,
  sourceTitle: string,
): string {
  return accountDisplayNames[getAccountDisplayKey(accountType, accountId)] ?? sourceTitle;
}
