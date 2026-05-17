#!/usr/bin/env python3
"""
Refresh local whooing.accounts from Whooing GET accounts.json.

Default mode is dry-run. Use --apply explicitly to write local DB rows.
This script never deletes local accounts; deletion sync is intentionally excluded.
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etl.whooing_client import WhooingClient

load_dotenv(ROOT / ".env")

ACCOUNT_TYPE_ORDER = ["assets", "liabilities", "capital", "expenses", "income"]


def _db_config() -> dict[str, Any]:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "ledger"),
        "user": os.getenv("DB_USER", "admin"),
        "password": os.getenv("DB_PASSWORD") or os.getenv("DB_PASS", "admin"),
    }


def normalize_accounts_payload(payload: dict[str, Any], section_id: str) -> list[dict[str, Any]]:
    results = payload.get("results") or {}
    normalized = []
    sort_order = 0

    for account_type in ACCOUNT_TYPE_ORDER:
        for row in results.get(account_type) or []:
            account_id = row.get("account_id")
            item_type = row.get("type") or row.get("item_type")
            if not account_id or item_type not in {"group", "account"}:
                continue
            normalized.append({
                "account_id": account_id,
                "section_id": section_id,
                "account_type": account_type,
                "item_type": item_type,
                "title": row.get("title") or "",
                "memo": row.get("memo") or "",
                "open_date": row.get("open_date") or None,
                "close_date": row.get("close_date") or None,
                "category": row.get("category") or "",
                "opt_use_date": row.get("opt_use_date") or None,
                "opt_pay_date": row.get("opt_pay_date") or None,
                "opt_pay_account_id": row.get("opt_pay_account_id") or None,
                "sort_order": sort_order,
            })
            sort_order += 1

    return normalized


def load_local_accounts(section_id: str) -> dict[tuple[str, str], dict[str, Any]]:
    sql = """
        select
          account_id,
          section_id,
          account_type,
          item_type,
          title,
          memo,
          open_date,
          close_date,
          category,
          opt_use_date,
          opt_pay_date,
          opt_pay_account_id,
          sort_order
        from whooing.accounts
        where section_id = %s
    """
    with psycopg2.connect(**_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (section_id,))
            columns = [desc[0] for desc in cur.description]
            return {
                (row[0], row[1]): dict(zip(columns, row))
                for row in cur.fetchall()
            }


def diff_accounts(
    api_rows: list[dict[str, Any]],
    local_rows: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    diffs = []
    compare_keys = [
        "account_type",
        "item_type",
        "title",
        "memo",
        "open_date",
        "close_date",
        "category",
        "opt_use_date",
        "opt_pay_date",
        "opt_pay_account_id",
        "sort_order",
    ]

    for row in api_rows:
        key = (row["account_id"], row["section_id"])
        local = local_rows.get(key)
        if local is None:
            diffs.append({"action": "insert", "row": row, "changed_fields": compare_keys})
            continue

        changed_fields = [
            field for field in compare_keys
            if comparable_value(local.get(field)) != comparable_value(row.get(field))
        ]
        if changed_fields:
            diffs.append({"action": "update", "row": row, "changed_fields": changed_fields})
        else:
            diffs.append({"action": "no_change", "row": row, "changed_fields": []})

    return diffs


def comparable_value(value: Any) -> Any:
    return None if value == "" else value


def local_only_accounts(
    api_rows: list[dict[str, Any]],
    local_rows: dict[tuple[str, str], dict[str, Any]],
) -> list[dict[str, Any]]:
    api_keys = {(row["account_id"], row["section_id"]) for row in api_rows}
    return [
        row for key, row in sorted(local_rows.items())
        if key not in api_keys
    ]


def upsert_accounts(rows: list[dict[str, Any]]) -> int:
    sql = """
        insert into whooing.accounts (
          account_id,
          section_id,
          account_type,
          item_type,
          title,
          memo,
          open_date,
          close_date,
          category,
          opt_use_date,
          opt_pay_date,
          opt_pay_account_id,
          sort_order,
          synced_at
        ) values (
          %(account_id)s,
          %(section_id)s,
          %(account_type)s,
          %(item_type)s,
          %(title)s,
          %(memo)s,
          %(open_date)s,
          %(close_date)s,
          %(category)s,
          %(opt_use_date)s,
          %(opt_pay_date)s,
          %(opt_pay_account_id)s,
          %(sort_order)s,
          now()
        )
        on conflict (account_id, section_id) do update set
          account_type = excluded.account_type,
          item_type = excluded.item_type,
          title = excluded.title,
          memo = excluded.memo,
          open_date = excluded.open_date,
          close_date = excluded.close_date,
          category = excluded.category,
          opt_use_date = excluded.opt_use_date,
          opt_pay_date = excluded.opt_pay_date,
          opt_pay_account_id = excluded.opt_pay_account_id,
          sort_order = excluded.sort_order,
          synced_at = now()
    """
    with psycopg2.connect(**_db_config()) as conn:
        with conn.cursor() as cur:
            for row in rows:
                cur.execute(sql, row)
            conn.commit()
    return len(rows)


def print_summary(
    api_rows: list[dict[str, Any]],
    diffs: list[dict[str, Any]],
    local_only_rows: list[dict[str, Any]],
    apply: bool,
) -> None:
    counts = {"insert": 0, "update": 0, "no_change": 0}
    for diff in diffs:
        counts[diff["action"]] += 1

    print(f"mode={'apply' if apply else 'dry-run'}")
    print(f"db_write={'enabled' if apply else 'disabled'}")
    print("delete_sync=disabled")
    print(f"fetched={len(api_rows)}")
    print(f"would_insert={counts['insert']}")
    print(f"would_update={counts['update']}")
    print(f"skipped={counts['no_change']}")
    print(f"local_only_not_deleted={len(local_only_rows)}")

    for diff in diffs:
        if diff["action"] == "no_change":
            continue
        row = diff["row"]
        changed = ",".join(diff["changed_fields"])
        print(
            f"- {diff['action']} {row['account_type']}:{row['account_id']} "
            f"title={row['title']} changed_fields={changed}"
        )
    for row in local_only_rows:
        print(f"- local_only_not_deleted {row['account_type']}:{row['account_id']} title={row['title']}")


def refresh_accounts(apply: bool = False) -> dict[str, int]:
    client = WhooingClient(sleep_seconds=0)
    payload = client.get_accounts()
    api_rows = normalize_accounts_payload(payload, client.section_id)
    local_rows = load_local_accounts(client.section_id)
    diffs = diff_accounts(api_rows, local_rows)
    local_only_rows = local_only_accounts(api_rows, local_rows)
    print_summary(api_rows, diffs, local_only_rows, apply)

    upserted = 0
    if apply:
        upserted = upsert_accounts(api_rows)
        print(f"upserted={upserted}")

    return {
        "fetched": len(api_rows),
        "upserted": upserted,
        "skipped": sum(1 for diff in diffs if diff["action"] == "no_change"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Refresh local whooing.accounts from Whooing accounts.json.")
    parser.add_argument("--apply", action="store_true", help="Write local DB upserts. Default is dry-run.")
    args = parser.parse_args()
    refresh_accounts(apply=args.apply)


if __name__ == "__main__":
    main()
