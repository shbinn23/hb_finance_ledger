WITH account_ranking AS (
    SELECT
        t.fixed_item_id,
        a.account_name,
        ROW_NUMBER() OVER(PARTITION BY t.fixed_item_id ORDER BY COUNT(*) DESC) as rank
    FROM report.fact_transactions t
             JOIN report.dim_account a ON t.account_id = a.account_id
    WHERE t.fixed_item_id IS NOT NULL
    GROUP BY t.fixed_item_id, a.account_name
)
SELECT
    f.fixed_item_id,
    CAST(ROUND(AVG(EXTRACT(DAY FROM t.transaction_date))) AS INTEGER) as due_day,
    AVG(ABS(t.net_amount)) as avg_amount,
    f.item_description,
    COALESCE(dp.category_name, dc.category_name) as parent_category,
    dc.category_name as sub_category,
    ar.account_name as primary_asset
FROM report.fact_transactions t
         JOIN report.dim_fixed_item f ON t.fixed_item_id = f.fixed_item_id
-- ✅ sc 테이블을 삭제했으므로 dc(dim_category)와 직접 조인합니다.
         JOIN report.dim_category dc ON f.category_id = dc.category_id
         LEFT JOIN report.dim_category dp ON dc.parent_category_id = dp.category_id
         LEFT JOIN account_ranking ar ON f.fixed_item_id = ar.fixed_item_id AND ar.rank = 1
WHERE t.transaction_type = '지출'
  AND t.transaction_date >= CURRENT_DATE - INTERVAL '180 days'
GROUP BY f.fixed_item_id, f.item_description, dp.category_name, dc.category_name, ar.account_name;
