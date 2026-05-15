import pandas as pd
from functools import lru_cache
from sqlalchemy import create_engine, text
from core.config import settings


@lru_cache(maxsize=1)
def _get_engine():
    return create_engine(settings.db_url, pool_pre_ping=True)


def _execute_query(query: str, params: dict = None, fallback_cols: list = None) -> pd.DataFrame:
    try:
        with _get_engine().connect() as conn:
            return pd.read_sql(text(query), conn, params=params or {})
    except Exception as e:
        print(f"DB query error: {e}")
        return pd.DataFrame(columns=fallback_cols or [])


def fetch_ai_training_features() -> pd.DataFrame:
    sql_path = "sql/spending/ai_training_features.sql"
    try:
        with open(sql_path, "r", encoding="utf-8") as f:
            query = f.read()
    except FileNotFoundError:
        return pd.DataFrame(columns=['ds', 'y', 'is_weekend', 'is_holiday', 'is_payday'])
    return _execute_query(query, fallback_cols=['ds', 'y', 'is_weekend', 'is_holiday', 'is_payday'])


def fetch_fixed_profile() -> pd.DataFrame:
    sql_path = "sql/spending/fixed_profile.sql"
    try:
        with open(sql_path, "r", encoding="utf-8") as f:
            query = f.read()
    except FileNotFoundError:
        return pd.DataFrame(columns=['due_day', 'item_description', 'primary_asset', 'avg_amount'])
    return _execute_query(query, fallback_cols=['due_day', 'item_description', 'primary_asset', 'avg_amount'])


def fetch_past_months() -> pd.DataFrame:
    return _execute_query(
        "SELECT transaction_date, daily_amount FROM report.vw_raw_daily_spending",
        fallback_cols=['transaction_date', 'daily_amount'],
    )


def fetch_anomaly_ml_features() -> pd.DataFrame:
    sql_path = "sql/spending/anomaly_ml_features.sql"
    try:
        with open(sql_path, "r", encoding="utf-8") as f:
            query = f.read()
    except FileNotFoundError:
        return pd.DataFrame(columns=[
            'transaction_date', 'day_of_month', 'day_of_week',
            'is_weekend', 'is_holiday', 'parent_category', 'description', 'amount'
        ])
    return _execute_query(query, fallback_cols=[
        'transaction_date', 'day_of_month', 'day_of_week',
        'is_weekend', 'is_holiday', 'parent_category', 'description', 'amount'
    ])
