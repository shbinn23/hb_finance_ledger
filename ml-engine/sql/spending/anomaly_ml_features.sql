-- ML Isolation Forest 학습을 위한 다차원 피처 세트 (최근 6개월 변동비)
SELECT
    t.transaction_date,
    EXTRACT(DAY FROM t.transaction_date) AS day_of_month,
    EXTRACT(ISODOW FROM t.transaction_date) AS day_of_week, -- 1(월) ~ 7(일)
    CASE WHEN d.is_weekend THEN 1 ELSE 0 END AS is_weekend,
    CASE WHEN d.is_holiday THEN 1 ELSE 0 END AS is_holiday,
    COALESCE(dp.category_name, c.category_name) AS parent_category,
    t.description,
    SUM(t.net_amount * -1) AS amount -- 환불 상계 처리된 순수 지출액
FROM report.fact_transactions t
         JOIN report.dim_date d ON t.transaction_date = d.full_date
         JOIN report.dim_category c ON t.category_id = c.category_id
         LEFT JOIN report.dim_category dp ON c.parent_category_id = dp.category_id
WHERE t.transaction_type = '지출'
  AND c.is_fixed_cost = false -- 고정비 제외 (변동비만 탐지)
  AND t.transaction_date >= CURRENT_DATE - INTERVAL '180 days' -- 최근 6개월 학습
GROUP BY
    t.transaction_date, d.is_weekend, d.is_holiday, dp.category_name, c.category_name, t.description
ORDER BY
    t.transaction_date;