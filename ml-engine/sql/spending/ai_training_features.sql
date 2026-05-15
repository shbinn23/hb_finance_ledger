-- AI 다변량 학습용 피처 세트 (날짜 메타데이터 포함)
SELECT
    t.transaction_date AS ds,
    SUM(t.amount) AS y,
    MAX(CASE WHEN d.is_weekend THEN 1 ELSE 0 END) AS is_weekend,
    MAX(CASE WHEN d.is_holiday THEN 1 ELSE 0 END) AS is_holiday,
    MAX(CASE WHEN d.is_payday THEN 1 ELSE 0 END) AS is_payday
FROM report.fact_transactions t
         JOIN report.dim_date d ON t.transaction_date = d.full_date
         LEFT JOIN report.dim_category c ON t.category_id = c.category_id
WHERE t.transaction_type = '지출'
  AND c.is_fixed_cost = false
  AND t.amount < 1000000 -- 이상치(100만 원 이상 단건) 제외
  AND t.transaction_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY t.transaction_date
ORDER BY t.transaction_date;