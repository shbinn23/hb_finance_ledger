#!/usr/bin/env python3
"""
Dry-run first maintenance script for Whooing account sort cleanup.

Default mode only reads local whooing.accounts and prints a safe plan.
Use --apply explicitly to send Whooing API sort PUT requests.

Cosmetic title rename is intentionally disabled. Whooing may normalize or reject
spacing/special-character changes in account titles, so the Whooing canonical
title is treated as source of truth.
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


SORT_PLANS = {
    "assets": [
        "x23", "x3", "x24", "x25", "x26", "x27", "x28", "x29", "x30",
        "x31", "x32", "x33", "x34", "x35", "x36",
        "x37", "x38", "x39", "x40", "x41",
    ],
    "liabilities": [
        "x42", "x22", "x43", "x44", "x45", "x46", "x47", "x48", "x49",
        "x50", "x51", "x52", "x53", "x54", "x55", "x56",
        "x57", "x91", "x92", "x93", "x94", "x95",
        "x58", "x59",
    ],
}

SKIPPED_LOCAL_ONLY_ACCOUNTS = {
    "x96": {
        "account_type": "liabilities",
        "title": "우리SKT구",
        "reason": "local_only_not_in_api",
        "action": "skip",
    },
}

MISSING_CREATE_CANDIDATES = [
    "신한 하이포인트",
    "하나 시그마",
    "신한 하이포인트(가족)",
    "롯데 쿠팡",
    "우리 NEW V",
    "신한 ALWAYS ON",
    "삼성화재 다이렉트",
]

DEPRECATED_RENAME_POLICY = (
    "cosmetic_title_rename_disabled; use Whooing canonical account titles"
)


def _db_config() -> dict[str, Any]:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "ledger"),
        "user": os.getenv("DB_USER", "admin"),
        "password": os.getenv("DB_PASSWORD") or os.getenv("DB_PASS", "admin"),
    }


def load_accounts() -> dict[str, dict[str, Any]]:
    sql = """
        select
          a.account_id,
          a.account_type,
          a.item_type,
          a.title,
          a.memo,
          a.open_date,
          a.close_date,
          a.category,
          a.opt_use_date,
          a.opt_pay_date,
          a.opt_pay_account_id,
          a.sort_order,
          a.original_ref_id,
          count(e.entry_id) filter (
            where e.l_account = a.account_type and e.l_account_id = a.account_id
          ) as used_as_left_count,
          count(e.entry_id) filter (
            where e.r_account = a.account_type and e.r_account_id = a.account_id
          ) as used_as_right_count,
          count(e.entry_id) filter (
            where (e.l_account = a.account_type and e.l_account_id = a.account_id)
               or (e.r_account = a.account_type and e.r_account_id = a.account_id)
          ) as total_used_count,
          max(floor(e.entry_date)) filter (
            where (e.l_account = a.account_type and e.l_account_id = a.account_id)
               or (e.r_account = a.account_type and e.r_account_id = a.account_id)
          ) as last_used_date
        from whooing.accounts a
        left join whooing.entries e
          on (e.l_account = a.account_type and e.l_account_id = a.account_id)
          or (e.r_account = a.account_type and e.r_account_id = a.account_id)
        where a.account_type in ('assets', 'liabilities')
        group by
          a.account_id, a.account_type, a.item_type, a.title, a.memo,
          a.open_date, a.close_date, a.category, a.opt_use_date,
          a.opt_pay_date, a.opt_pay_account_id, a.sort_order, a.original_ref_id
        order by a.account_type, a.sort_order nulls last, a.account_id
    """
    with psycopg2.connect(**_db_config()) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            columns = [desc[0] for desc in cur.description]
            return {row[0]: dict(zip(columns, row)) for row in cur.fetchall()}


def validate_plan(accounts: dict[str, dict[str, Any]]) -> list[str]:
    errors = []
    for account_type, desired_ids in SORT_PLANS.items():
        current_ids = {
            row["account_id"]
            for row in accounts.values()
            if row["account_type"] == account_type
            and row["account_id"] not in SKIPPED_LOCAL_ONLY_ACCOUNTS
        }
        desired_set = set(desired_ids)
        if current_ids != desired_set:
            errors.append(
                f"sort_ids_mismatch:{account_type}:"
                f"missing={sorted(current_ids - desired_set)},extra={sorted(desired_set - current_ids)}"
            )
    return errors


def print_dry_run(accounts: dict[str, dict[str, Any]], errors: list[str]) -> None:
    print("mode=dry-run")
    print("sort_api_put=disabled")
    print("db_write=disabled")
    print(f"title_rename_policy={DEPRECATED_RENAME_POLICY}")

    print("sort_plan")
    for account_type, desired_ids in SORT_PLANS.items():
        current_ids = [
            row["account_id"]
            for row in sorted(
                accounts.values(),
                key=lambda row: (row["account_type"], row["sort_order"] if row["sort_order"] is not None else 9999),
            )
            if row["account_type"] == account_type
            and row["account_id"] not in SKIPPED_LOCAL_ONLY_ACCOUNTS
        ]
        print(f"- {account_type} before={','.join(current_ids)}")
        print(f"- {account_type} after ={','.join(desired_ids)}")

    print("skipped_local_only_accounts")
    for account_id, skipped in SKIPPED_LOCAL_ONLY_ACCOUNTS.items():
        row = accounts.get(account_id)
        title = row["title"] if row else skipped["title"]
        print(
            f"- {skipped['account_type']}:{account_id} title={title} "
            f"reason={skipped['reason']} action={skipped['action']}"
        )

    print("missing_create_candidates")
    for title in MISSING_CREATE_CANDIDATES:
        print(f"- {title} action=create_candidate_not_created")

    print("validation")
    if errors:
        for error in errors:
            print(f"- {error}")
        return
    print("- ok")


def apply_plan(accounts: dict[str, dict[str, Any]], sleep_seconds: float) -> None:
    errors = validate_plan(accounts)
    if errors:
        raise RuntimeError("Plan validation failed; run dry-run and inspect validation output")

    client = WhooingClient(sleep_seconds=sleep_seconds)
    for account_type, account_ids in SORT_PLANS.items():
        client.sort_accounts(account_type, account_ids)
        print(f"updated_sort {account_type} count={len(account_ids)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run/apply Whooing account sort cleanup.")
    parser.add_argument("--apply", action="store_true", help="Send Whooing sort API PUT requests. Default is dry-run.")
    parser.add_argument("--sleep-seconds", type=float, default=3.0, help="Delay between Whooing API calls in apply mode.")
    args = parser.parse_args()

    accounts = load_accounts()
    errors = validate_plan(accounts)
    if not args.apply:
        print_dry_run(accounts, errors)
        return

    apply_plan(accounts, args.sleep_seconds)
    print("apply_complete")
    print("local_accounts_refresh_required=true")


if __name__ == "__main__":
    main()
