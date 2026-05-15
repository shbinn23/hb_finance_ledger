from decimal import Decimal

CAPTURED_AT = "2026-05-15 12:15 Asia/Seoul"

TOTAL_TARGETS = {
    "assets": Decimal("87644364"),
    "liabilities": Decimal("10865476"),
    "net_worth": Decimal("76778888"),
}

BALANCE_TARGETS = {
    "국민은행": Decimal("601198"),
    "우리은행": Decimal("0"),
    "부산은행": Decimal("0"),
    "우리 Npay": Decimal("2019111"),
    "하나은행": Decimal("0"),
    "새마을금고": Decimal("0"),
    "카카오페이증권": Decimal("0"),
    "신한은행": Decimal("0"),
    "우체국": Decimal("103745"),
    "국민 톡톡": Decimal("25000"),
    "국민 CJ": Decimal("0"),
    "하나 스마트애니": Decimal("0"),
    "하나 MG+S": Decimal("614865"),
    "우리 Olleh": Decimal("0"),
    "우리 SKT": Decimal("0"),
    "우리 카드의정석2": Decimal("0"),
    "신한 레이디": Decimal("38475"),
    "신한 밥친구": Decimal("0"),
    "농협 플렉스": Decimal("0"),
    "롯데 라이킷": Decimal("179215"),
    "롯데 쿠팡": Decimal("0"),
    "BC Goat": Decimal("7921"),
    "BC 케이퍼스트": Decimal("0"),
    "현대 제로": Decimal("0"),
    "삼성 행복": Decimal("0"),
    "신한 딥온": Decimal("0"),
    "새마을 더나은": Decimal("0"),
    "신한 쿠팡": Decimal("0"),
    "국민 직장인": Decimal("0"),
    "우체국 개이득": Decimal("-24260"),
    "국민 나사카": Decimal("0"),
    "신한 하이패스": Decimal("0"),
    "하나 나사카": Decimal("0"),
    "네이버머니": Decimal("0"),
    "민생지원쿠폰": Decimal("0"),
    "네이버 cma": Decimal("450310"),
    "우리 cma": Decimal("0"),
    "청년적금": Decimal("15400000"),
    "새마을 예금": Decimal("25000000"),
    "차량대금": Decimal("10000000"),
    "삼성화재 다이렉트": Decimal("0"),
    "보증금": Decimal("30000000"),
    "아이오닉 하이브리드": Decimal("14070000"),
}

CHECK_CARD_TO_BANK = {
    "우체국 개이득": "우체국",
    "국민 나사카": "국민은행",
    "신한 하이패스": "국민은행",
    "하나 나사카": "하나은행",
}
