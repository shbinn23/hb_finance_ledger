#!/usr/bin/env python3
"""
후잉 API → whooing.entries DB 동기화

실행:
  python etl/sync_whooing.py           # 기본: 최근 7일
  python etl/sync_whooing.py --days 30 # 범위 확장
"""

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etl.whooing_client import WhooingClient

load_dotenv(ROOT / ".env")


def _db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "ledger"),
        "user": os.getenv("DB_USER", "admin"),
        "password": os.getenv("DB_PASSWORD") or os.getenv("DB_PASS", "admin"),
    }


def fetch_entries(
    start_date: str,
    end_date: str,
    limit_total: Optional[int] = None,
    client: Optional[WhooingClient] = None,
    sleep_seconds: float = 3.0,
) -> list[dict]:
    whooing = client or WhooingClient(sleep_seconds=sleep_seconds)
    return whooing.get_entries(start_date, end_date, limit_total=limit_total)


def _entry_values(entry: dict, section_id: str) -> tuple:
    return (
        entry["entry_id"],
        section_id,
        entry.get("entry_date"),
        entry.get("l_account"),
        entry.get("l_account_id"),
        entry.get("r_account"),
        entry.get("r_account_id"),
        entry.get("item", ""),
        entry.get("money", 0),
        entry.get("total"),
        entry.get("memo", ""),
        entry.get("app_id", 0),
    )


def _date_range(days: int, start_date: Optional[str], end_date: Optional[str]) -> tuple[str, str]:
    if start_date or end_date:
        if not start_date or not end_date:
            raise ValueError("--start-date and --end-date must be provided together")
        return start_date, end_date

    end_dt = datetime.today()
    start_dt = end_dt - timedelta(days=days)
    return start_dt.strftime("%Y%m%d"), end_dt.strftime("%Y%m%d")


def sync(
    days: int = 7,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit_total: Optional[int] = None,
    sleep_seconds: float = 3.0,
) -> None:
    start_str, end_str = _date_range(days, start_date, end_date)

    print(f"동기화 범위: {start_str} ~ {end_str}")

    client = WhooingClient(sleep_seconds=sleep_seconds)
    entries = fetch_entries(start_str, end_str, limit_total=limit_total, client=client)
    print(f"후잉 entries: {len(entries)}건")

    api_ids = {int(e["entry_id"]) for e in entries if e.get("entry_id")}
    range_start = int(start_str)
    range_end   = int(end_str) + 1  # entry_date < range_end 로 당일 포함

    conn = psycopg2.connect(**_db_config())
    cur  = conn.cursor()

    upserted = 0
    for e in entries:
        try:
            cur.execute("""
                INSERT INTO whooing.entries (
                    entry_id, section_id, entry_date,
                    l_account, l_account_id, r_account, r_account_id,
                    item, money, total, memo, app_id, synced_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (entry_id) DO UPDATE SET
                    section_id    = EXCLUDED.section_id,
                    entry_date    = EXCLUDED.entry_date,
                    l_account     = EXCLUDED.l_account,
                    l_account_id  = EXCLUDED.l_account_id,
                    r_account     = EXCLUDED.r_account,
                    r_account_id  = EXCLUDED.r_account_id,
                    item          = EXCLUDED.item,
                    money         = EXCLUDED.money,
                    total         = EXCLUDED.total,
                    memo          = EXCLUDED.memo,
                    app_id        = EXCLUDED.app_id,
                    synced_at     = NOW()
            """, _entry_values(e, client.section_id))
            upserted += 1
        except Exception as ex:
            print(f"  !! upsert 오류 (entry_id={e.get('entry_id')}): {ex}")

    # 후잉에서 삭제된 항목 DB에서도 제거
    if api_ids:
        cur.execute("""
            DELETE FROM whooing.entries
            WHERE section_id = %s
              AND entry_date >= %s AND entry_date < %s
              AND NOT (entry_id = ANY(%s))
        """, (client.section_id, range_start, range_end, list(api_ids)))
    else:
        cur.execute("""
            DELETE FROM whooing.entries
            WHERE section_id = %s
              AND entry_date >= %s AND entry_date < %s
        """, (client.section_id, range_start, range_end))

    deleted = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()

    print(f"upsert: {upserted}건 / 삭제: {deleted}건")
    print("✅ 동기화 완료")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7, help="동기화 범위 (일, 기본 7)")
    parser.add_argument("--start-date", help="동기화 시작일 YYYYMMDD")
    parser.add_argument("--end-date", help="동기화 종료일 YYYYMMDD")
    parser.add_argument("--limit-total", type=int, help="API에서 가져올 최대 건수")
    parser.add_argument("--sleep-seconds", type=float, default=3.0, help="후잉 API 호출 간 대기")
    args = parser.parse_args()
    sync(
        days=args.days,
        start_date=args.start_date,
        end_date=args.end_date,
        limit_total=args.limit_total,
        sleep_seconds=args.sleep_seconds,
    )
