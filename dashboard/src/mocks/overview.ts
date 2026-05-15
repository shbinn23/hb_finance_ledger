export const overviewMetrics = {
  currentSpend: 1_480_000,
  predictedFinal: 2_320_000,
  safeDaily: 27_600,
  remainingDays: 22,
  status: "WARNING" as const,
  message:
    "이달 예측 지출이 한도를 220,000원 초과할 것으로 보입니다. 남은 22일간 하루 27,600원 이하로 유지하세요.",
};

export const mainChartData = {
  current: [
    { day: 1, amount: 45000 }, { day: 2, amount: 120000 },
    { day: 3, amount: 195000 }, { day: 4, amount: 280000 },
    { day: 5, amount: 380000 }, { day: 6, amount: 520000 },
    { day: 7, amount: 680000 }, { day: 8, amount: 850000 },
    { day: 9, amount: 980000 }, { day: 10, amount: 1100000 },
    { day: 11, amount: 1250000 }, { day: 12, amount: 1480000 },
  ],
  predicted: [
    { day: 12, amount: 1480000 }, { day: 15, amount: 1620000 },
    { day: 20, amount: 1950000 }, { day: 25, amount: 2180000 },
    { day: 28, amount: 2280000 }, { day: 31, amount: 2320000 },
  ],
  aiPrediction: [
    { day: 13, amount: 1550000 }, { day: 16, amount: 1720000 },
    { day: 19, amount: 1880000 }, { day: 22, amount: 2020000 },
    { day: 25, amount: 2150000 }, { day: 28, amount: 2250000 },
    { day: 31, amount: 2300000 },
  ],
  aiBounds: [
    { day: 13, upper: 1620000, lower: 1480000 },
    { day: 16, upper: 1820000, lower: 1640000 },
    { day: 19, upper: 2000000, lower: 1780000 },
    { day: 22, upper: 2160000, lower: 1900000 },
    { day: 25, upper: 2280000, lower: 2020000 },
    { day: 28, upper: 2380000, lower: 2120000 },
    { day: 31, upper: 2450000, lower: 2180000 },
  ],
  pastAvg: [
    { day: 1, amount: 50000 }, { day: 5, amount: 420000 },
    { day: 10, amount: 950000 }, { day: 15, amount: 1400000 },
    { day: 20, amount: 1750000 }, { day: 25, amount: 1950000 },
    { day: 31, amount: 2080000 },
  ],
};

export const todaySpending = [
  { date: "2026-05-09", asset: "현대카드", parent: "식비", child: "외식", desc: "점심 회식", amount: 45000 },
  { date: "2026-05-09", asset: "신한카드", parent: "교통", child: "주유", desc: "주유소", amount: 82000 },
  { date: "2026-05-09", asset: "현금", parent: "식비", child: "카페", desc: "스타벅스", amount: 6500 },
];
