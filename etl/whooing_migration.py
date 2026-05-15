#!/usr/bin/env python3
import argparse
import os
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Iterator, Optional

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from etl.whooing_client import WhooingClient
from etl.whooing_mapper import WhooingMapper
from etl.whooing_reconcile import apply_entry_balance_deltas, summarize_entries
from etl.whooing_targets import BALANCE_TARGETS, CHECK_CARD_TO_BANK, TOTAL_TARGETS
from etl.whooing_transform import transform_transaction
import psycopg2
from dotenv import load_dotenv

load_dotenv(ROOT / ".env")


def _parse_ymd(value: str) -> datetime:
    return datetime.strptime(value, "%Y%m%d")


def _windows(start_date: str, end_date: str, days: int = 7) -> Iterator[tuple[str, str]]:
    current = _parse_ymd(start_date)
    final = _parse_ymd(end_date)
    while current <= final:
        window_end = min(current + timedelta(days=days - 1), final)
        yield current.strftime("%Y%m%d"), window_end.strftime("%Y%m%d")
        current = window_end + timedelta(days=1)


def _ym(value: str) -> str:
    return value[:6]


def _write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def _chunks(items: list, size: int) -> Iterator[list]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _upload_entry_payload(entry: dict) -> dict:
    fields = ("entry_date", "l_account", "l_account_id", "r_account", "r_account_id", "item", "money", "memo")
    return {field: entry[field] for field in fields if field in entry}


def _normalize_title(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def _slice_entries(entries: list[dict], offset: int = 0, limit: Optional[int] = None) -> list[dict]:
    selected = entries[offset:]
    if limit is not None:
        selected = selected[:limit]
    return selected


def _account_lookup(accounts_payload: dict) -> dict[str, tuple[str, str, str]]:
    lookup = {}
    for account_type, rows in (accounts_payload.get("results") or {}).items():
        for row in rows:
            if row.get("type") != "account":
                continue
            lookup[_normalize_title(row.get("title") or "")] = (
                account_type,
                row["account_id"],
                row.get("title") or "",
            )
    return lookup


def _target_balances(accounts_payload: dict) -> dict[tuple[str, str], Decimal]:
    lookup = _account_lookup(accounts_payload)
    targets = {}
    aliases = {
        "우리 Npay": "우리Npay",
        "하나 MG+S": "하나MGS",
        "우리 Olleh": "우리Olleh",
        "우리 SKT": "우리SKT",
        "우리 카드의정석2": "우리카드의정석2",
        "하나 스마트애니": "하나스마트애니",
        "신한 레이디": "신한레이디",
        "신한 밥친구": "신한밥친구",
        "농협 플렉스": "농협플렉스",
        "롯데 라이킷": "롯데라이킷",
        "BC 케이퍼스트": "BC케이퍼스트",
        "우체국 개이득": "우체국개이득",
        "국민 나사카": "국민나사카",
        "신한 하이패스": "신한하이패스",
        "하나 나사카": "하나나사카",
        "네이버 cma": "네이버CMA",
        "새마을 예금": "새마을예금",
    }
    # 편한가계부 체크카드 사용액은 잔액 총계가 아니라 사용액 섹션이므로,
    # 후잉 BS 잔액 목표에서는 0으로 둔다. 사용액은 checkcard 리포트로 별도 검증한다.
    balance_overrides = {"우체국 개이득": Decimal("0")}
    for name, amount in BALANCE_TARGETS.items():
        target_name = aliases.get(name, name)
        ref = lookup.get(_normalize_title(target_name))
        if not ref:
            if amount == 0:
                continue
            raise KeyError(f"No Whooing account for target {name}")
        account_type, account_id, _ = ref
        targets[(account_type, account_id)] = balance_overrides.get(name, amount)
    return targets


def _current_balances(report_payload: dict) -> dict[tuple[str, str], Decimal]:
    results = report_payload["results"]
    balances = {}
    for account_type in ("assets", "liabilities"):
        for account_id, value in results.get(account_type, {}).get("accounts", {}).items():
            balances[(account_type, account_id)] = Decimal(str(value))
    return balances


def _stringify_balance_map(balances: dict[tuple[str, str], Decimal]) -> dict[str, Decimal]:
    return {f"{account_type}:{account_id}": value for (account_type, account_id), value in sorted(balances.items())}


def _opening_adjustment(account_type: str, account_id: str, amount: Decimal, item: str) -> dict:
    money = abs(amount)
    if money == 0:
        raise ValueError("opening adjustment amount cannot be zero")
    if account_type == "assets":
        if amount > 0:
            l_account, l_account_id, r_account, r_account_id = "assets", account_id, "capital", "x1"
        else:
            l_account, l_account_id, r_account, r_account_id = "capital", "x1", "assets", account_id
    elif account_type == "liabilities":
        if amount > 0:
            l_account, l_account_id, r_account, r_account_id = "capital", "x1", "liabilities", account_id
        else:
            l_account, l_account_id, r_account, r_account_id = "liabilities", account_id, "capital", "x1"
    else:
        raise ValueError(f"unsupported account_type: {account_type}")
    return {
        "entry_date": "20250731",
        "l_account": l_account,
        "l_account_id": l_account_id,
        "r_account": r_account,
        "r_account_id": r_account_id,
        "money": money,
        "item": item,
        "memo": "[MIG:OPENING] recalculated from 2026-05-15 EasyAsset snapshot",
    }


def _db_config() -> dict:
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "ledger"),
        "user": os.getenv("DB_USER", "admin"),
        "password": os.getenv("DB_PASSWORD") or os.getenv("DB_PASS", "admin"),
    }


def _extract_posted_entry_id(payload: dict) -> str:
    results = payload.get("results")
    if isinstance(results, dict):
        for key in ("entry_id", "id"):
            if results.get(key):
                return str(results[key])
        rows = results.get("rows")
        if isinstance(rows, list) and rows and rows[0].get("entry_id"):
            return str(rows[0]["entry_id"])
    if isinstance(results, list) and results and isinstance(results[0], dict) and results[0].get("entry_id"):
        return str(results[0]["entry_id"])
    raise RuntimeError(f"Cannot find posted entry id: {json.dumps(payload, ensure_ascii=False)}")


def _checkcard_money(payload: dict, account_id: str) -> int:
    aggregate = payload.get("results", {}).get("aggregate", {})
    for row in aggregate.get("accounts", []):
        if str(row.get("account_id")).lower() == account_id.lower():
            return int(row.get("money") or 0)
    return 0


def _asset_out(payload: dict) -> int:
    results = payload.get("results", {})
    total = results.get("total", {}) if isinstance(results, dict) else {}
    return int(total.get("out") or 0)


def _is_probe_entry(row: dict) -> bool:
    return row.get("item") == "MIG_CHECKCARD_PROBE"


def _has_auto_checkcard_settlement(rows: list[dict], checkcard_account_id: str,
                                   linked_bank_account_id: str, amount: int) -> bool:
    for row in rows:
        if not _is_probe_entry(row):
            continue
        if (
            row.get("l_account") == "liabilities"
            and row.get("l_account_id") == checkcard_account_id
            and row.get("r_account") == "assets"
            and row.get("r_account_id") == linked_bank_account_id
            and int(row.get("money") or 0) == amount
        ):
            return True
    return False


def snapshot(args) -> None:
    client = WhooingClient()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    accounts = client.get_accounts()
    entries = []
    for start, end in _windows(args.start_date, args.end_date):
        entries.extend(client.get_entries(start, end))
    checkcard = client.get_checkcard(_ym(args.start_date), _ym(args.end_date))

    _write_json(artifact_dir / "accounts.json", accounts)
    _write_json(artifact_dir / "entries.json", entries)
    _write_json(artifact_dir / "checkcard.json", checkcard)
    manifest = {
        "created_at": timestamp,
        "start_date": args.start_date,
        "end_date": args.end_date,
        "account_groups": list((accounts.get("results") or {}).keys()) if isinstance(accounts, dict) else [],
        "entry_count": len(entries),
    }
    _write_json(artifact_dir / "manifest.json", manifest)

    print(f"snapshot_dir={artifact_dir}")
    print(f"entries={len(entries)}")
    print("accounts_snapshot=written")
    print("checkcard_snapshot=written")


def report(args) -> None:
    client = WhooingClient(sleep_seconds=args.sleep_seconds)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    payload = client.get_report(args.account, args.start_date, args.end_date)
    _write_json(artifact_dir / "report.json", payload)
    print(f"report_dir={artifact_dir}")
    print("report=written")


def checkcard_probe(args) -> None:
    client = WhooingClient()
    start_ym = _ym(args.date)

    before_checkcard = client.get_checkcard(start_ym, start_ym)
    before_check_money = _checkcard_money(before_checkcard, args.checkcard_account_id)

    entry_id = None
    try:
        payload = client.post_entry({
            "entry_date": args.date,
            "l_account": "expenses",
            "l_account_id": args.expense_account_id,
            "r_account": "liabilities",
            "r_account_id": args.checkcard_account_id,
            "item": "MIG_CHECKCARD_PROBE",
            "money": args.amount,
            "memo": "[MIG:PROBE] checkcard native behavior probe",
        })
        entry_id = _extract_posted_entry_id(payload)

        after_checkcard = client.get_checkcard(start_ym, start_ym)
        after_entries = client.get_entries(args.date, args.date)
        check_delta = _checkcard_money(after_checkcard, args.checkcard_account_id) - before_check_money
        has_auto_settlement = _has_auto_checkcard_settlement(
            after_entries,
            args.checkcard_account_id,
            args.linked_bank_account_id,
            args.amount,
        )

        print(f"probe_entry_id={entry_id}")
        print(f"checkcard_delta={check_delta}")
        print(f"auto_settlement_entry={str(has_auto_settlement).lower()}")
        if check_delta == args.amount and has_auto_settlement:
            print("CHECKCARD_STRATEGY=native")
        else:
            print("CHECKCARD_STRATEGY=paired")
    finally:
        deleted = 0
        for row in client.get_entries(args.date, args.date):
            if _is_probe_entry(row) and row.get("entry_id"):
                client.delete_entry(row["entry_id"])
                deleted += 1
        print(f"probe_entries_deleted={deleted}")


def _load_transactions(conn, start_date: str, end_date: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                ft.transaction_id::text,
                ft.transaction_date::text,
                ft.account_id,
                da.account_name,
                COALESCE(dat.type_name, '미분류') AS account_kind,
                da.linked_account_id,
                ft.category_id,
                COALESCE(dp.category_name, '') AS parent_category,
                dc.category_name AS child_category,
                ft.amount,
                ft.net_amount,
                ft.transaction_type,
                ft.description,
                ft.note
            FROM report.fact_transactions ft
            JOIN report.dim_account da ON da.account_id = ft.account_id
            LEFT JOIN report.dim_account_type dat ON dat.type_id = da.type_id
            JOIN report.dim_category dc ON dc.category_id = ft.category_id
            LEFT JOIN report.dim_category dp ON dp.category_id = dc.parent_category_id
            WHERE ft.transaction_date BETWEEN %s AND %s
            ORDER BY ft.transaction_date, ft.daily_seq, ft.transaction_id
            """,
            (start_date, end_date),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def _base_tx(row: dict, mapper: WhooingMapper) -> dict:
    account_ref = mapper.get(row["account_id"])
    category_ref = None
    if row["transaction_type"] in {"지출", "수입", "이체입금"}:
        category_ref = mapper.get(row["category_id"])
        if row["transaction_type"] == "수입" and category_ref.account_type != "income":
            category_ref = mapper.fallback_income()
    linked_bank_account_id = None
    if row.get("linked_account_id"):
        linked_bank_account_id = mapper.get(row["linked_account_id"]).account_id
    return {
        "transaction_type": row["transaction_type"],
        "account_name": row["account_name"],
        "account_kind": row["account_kind"],
        "account_type": account_ref.account_type,
        "account_id": account_ref.account_id,
        "category_account_type": category_ref.account_type if category_ref else None,
        "category_account_id": category_ref.account_id if category_ref else None,
        "linked_bank_account_id": linked_bank_account_id,
        "amount": Decimal(str(row["amount"])),
        "net_amount": Decimal(str(row["net_amount"])),
        "description": row.get("description") or "",
        "transaction_date": row["transaction_date"],
        "source_ref": row["transaction_id"],
        "capital_account_id": "x1",
    }


def dry_run(args) -> None:
    client = WhooingClient(sleep_seconds=0)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    with psycopg2.connect(**_db_config()) as conn:
        mapper = WhooingMapper.load(conn, client.section_id)
        rows = _load_transactions(conn, args.start_date, args.end_date)

    candidate_entries = []
    skipped = Counter()
    unmapped = []
    for row in rows:
        try:
            if row["transaction_type"] == "이체출금":
                skipped[row["transaction_type"]] += 1
                continue
            if Decimal(str(row["net_amount"])) == 0:
                skipped["zero_net_amount"] += 1
                continue
            tx = _base_tx(row, mapper)
            entries = transform_transaction(tx, checkcard_strategy=args.checkcard_strategy)
            if not entries:
                skipped[row["transaction_type"]] += 1
                continue
            for entry in entries:
                entry["entry_date"] = row["transaction_date"].replace("-", "")
                entry["source_transaction_id"] = row["transaction_id"]
            candidate_entries.extend(entries)
        except KeyError as exc:
            unmapped.append(f"{row['transaction_id']} {row['transaction_type']} {exc}")

    _write_json(artifact_dir / "candidate_entries.json", candidate_entries)
    report = summarize_entries(candidate_entries, skipped, unmapped)
    (artifact_dir / "reconciliation.md").write_text(report, encoding="utf-8")
    print(f"dry_run_dir={artifact_dir}")
    print(f"source_transactions={len(rows)}")
    print(f"candidate_entries={len(candidate_entries)}")
    print(f"skipped_transactions={sum(skipped.values())}")
    print(f"unmapped_transactions={len(unmapped)}")


def balanced_dry_run(args) -> None:
    client = WhooingClient(sleep_seconds=args.sleep_seconds)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)

    accounts_payload = client.get_accounts()
    report_payload = client.get_report("assets,liabilities", args.start_date.replace("-", ""), args.end_date.replace("-", ""))
    target_balances = _target_balances(accounts_payload)
    current_balances = defaultdict(Decimal, _current_balances(report_payload))
    simulated_balances = defaultdict(Decimal, current_balances)
    checkcard_by_id = {}

    with psycopg2.connect(**_db_config()) as conn:
        mapper = WhooingMapper.load(conn, client.section_id)
        rows = _load_transactions(conn, args.start_date, args.end_date)
        for checkcard_name, bank_name in CHECK_CARD_TO_BANK.items():
            try:
                checkcard = mapper.get("ACC_" + __import__("hashlib").md5(checkcard_name.encode("utf-8")).hexdigest()[:10])
                bank = mapper.get("ACC_" + __import__("hashlib").md5(bank_name.encode("utf-8")).hexdigest()[:10])
                checkcard_by_id[checkcard.account_id] = bank.account_id
            except KeyError:
                continue

    transaction_entries = []
    skipped = Counter()
    unmapped = []
    for row in rows:
        try:
            if row["transaction_type"] in {"차액수입", "차액지출", "이체출금"}:
                skipped[row["transaction_type"]] += 1
                continue
            if Decimal(str(row["net_amount"])) == 0:
                skipped["zero_net_amount"] += 1
                continue
            tx = _base_tx(row, mapper)
            entries = transform_transaction(tx, checkcard_strategy="native")
            for entry in entries:
                entry["entry_date"] = row["transaction_date"].replace("-", "")
                entry["source_transaction_id"] = row["transaction_id"]
                apply_entry_balance_deltas(simulated_balances, entry)
                if row["transaction_type"] == "지출" and row["account_kind"] == "체크카드":
                    bank_account_id = tx.get("linked_bank_account_id") or checkcard_by_id.get(tx["account_id"])
                    if bank_account_id:
                        auto_entry = {
                            "l_account": "liabilities",
                            "l_account_id": tx["account_id"],
                            "r_account": "assets",
                            "r_account_id": bank_account_id,
                            "money": entry["money"],
                        }
                        apply_entry_balance_deltas(simulated_balances, auto_entry)
            transaction_entries.extend(entries)
        except KeyError as exc:
            unmapped.append(f"{row['transaction_id']} {row['transaction_type']} {exc}")

    opening_entries = []
    for key, target in sorted(target_balances.items()):
        amount = target - simulated_balances[key]
        if amount:
            account_type, account_id = key
            entry = _opening_adjustment(account_type, account_id, amount, "기초잔액")
            opening_entries.append(entry)
            apply_entry_balance_deltas(simulated_balances, entry)

    final_entries = opening_entries + transaction_entries
    diffs = {}
    for key, target in sorted(target_balances.items()):
        current = simulated_balances[key]
        if current != target:
            diffs[f"{key[0]}:{key[1]}"] = {"target": target, "simulated": current, "diff": target - current}

    totals = {
        "assets": sum(simulated_balances[key] for key in target_balances if key[0] == "assets"),
        "liabilities": sum(simulated_balances[key] for key in target_balances if key[0] == "liabilities"),
    }
    totals["net_worth"] = totals["assets"] - totals["liabilities"]

    _write_json(artifact_dir / "candidate_entries.json", final_entries)
    _write_json(artifact_dir / "opening_entries.json", opening_entries)
    _write_json(artifact_dir / "balance_reconciliation.json", {
        "current_balances": _stringify_balance_map(dict(current_balances)),
        "target_balances": _stringify_balance_map(target_balances),
        "simulated_balances": _stringify_balance_map(dict(simulated_balances)),
        "diffs": diffs,
        "totals": totals,
        "total_targets": TOTAL_TARGETS,
        "skipped": dict(skipped),
        "unmapped": unmapped,
    })
    print(f"balanced_dry_run_dir={artifact_dir}")
    print(f"opening_entries={len(opening_entries)}")
    print(f"transaction_entries={len(transaction_entries)}")
    print(f"candidate_entries={len(final_entries)}")
    print(f"balance_diffs={len(diffs)}")
    print(f"simulated_assets={totals['assets']}")
    print(f"simulated_liabilities={totals['liabilities']}")
    print(f"simulated_net_worth={totals['net_worth']}")


def upload(args) -> None:
    if not args.yes:
        raise SystemExit("Refusing to upload without --yes")

    candidate_file = Path(args.candidate_file)
    candidate_entries = json.loads(candidate_file.read_text(encoding="utf-8"))
    candidate_entries = _slice_entries(candidate_entries, args.offset, args.limit)

    client = WhooingClient(sleep_seconds=args.sleep_seconds)
    uploaded = []
    upload_started_at = datetime.now().strftime("%Y%m%d-%H%M%S")
    manifest_path = candidate_file.parent / f"upload-{upload_started_at}.json"
    for batch_index, chunk in enumerate(_chunks([_upload_entry_payload(entry) for entry in candidate_entries], args.batch_size), start=1):
        uploaded.append(client.post_entries(chunk))
        _write_json(manifest_path, {
            "candidate_file": str(candidate_file),
            "uploaded_at": upload_started_at,
            "offset": args.offset,
            "requested_entries": len(candidate_entries),
            "batch_size": args.batch_size,
            "batch_count": len(uploaded),
            "completed": False,
            "responses": uploaded,
        })
        print(f"upload_batch_progress={batch_index}", flush=True)

    manifest = {
        "candidate_file": str(candidate_file),
        "uploaded_at": upload_started_at,
        "offset": args.offset,
        "requested_entries": len(candidate_entries),
        "batch_size": args.batch_size,
        "batch_count": len(uploaded),
        "completed": True,
        "responses": uploaded,
    }
    _write_json(manifest_path, manifest)
    print(f"upload_manifest={manifest_path}")
    print(f"uploaded_entries={len(candidate_entries)}")


def reset_entries(args) -> None:
    if not args.yes:
        raise SystemExit("Refusing to delete entries without --yes")

    client = WhooingClient(sleep_seconds=args.sleep_seconds)
    rows = client.get_entries(args.start_date, args.end_date, limit_total=args.limit)
    entry_ids = [str(row["entry_id"]) for row in rows if row.get("entry_id")]

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    target_path = artifact_dir / "reset_targets.json"
    _write_json(target_path, {
        "start_date": args.start_date,
        "end_date": args.end_date,
        "entry_ids": entry_ids,
    })

    deleted = []
    for chunk in _chunks(entry_ids, 100):
        try:
            deleted.append(client.delete_entries(chunk))
        except Exception as exc:
            deleted.append({"batch_error": str(exc), "fallback": "single_delete", "count": len(chunk)})
            for index, entry_id in enumerate(chunk, start=1):
                deleted.append(client.delete_entry(entry_id))
                if index % 25 == 0:
                    print(f"deleted_fallback_progress={index}/{len(chunk)}", flush=True)

    _write_json(artifact_dir / "reset_result.json", {
        "start_date": args.start_date,
        "end_date": args.end_date,
        "entry_ids": entry_ids,
        "responses": deleted,
    })
    print(f"reset_dir={artifact_dir}")
    print(f"reset_targets={target_path}")
    print(f"deleted_entries={len(entry_ids)}")


def delete_ids(args) -> None:
    if not args.yes:
        raise SystemExit("Refusing to delete entries without --yes")

    client = WhooingClient(sleep_seconds=args.sleep_seconds)
    entry_ids = [entry_id.strip() for entry_id in args.ids.split(",") if entry_id.strip()]
    responses = []
    try:
        responses.append(client.delete_entries(entry_ids))
    except Exception as exc:
        responses.append({"batch_error": str(exc), "fallback": "single_delete", "count": len(entry_ids)})
        for index, entry_id in enumerate(entry_ids, start=1):
            responses.append(client.delete_entry(entry_id))
            if index % 25 == 0:
                print(f"deleted_fallback_progress={index}/{len(entry_ids)}", flush=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    artifact_dir = Path("artifacts") / "whooing" / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=True)
    _write_json(artifact_dir / "delete_ids_result.json", {
        "entry_ids": entry_ids,
        "responses": responses,
    })
    print(f"delete_dir={artifact_dir}")
    print(f"deleted_entries={len(entry_ids)}")


def _entry_ids_from_upload_manifest(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    entry_ids = []
    for response in payload.get("responses", []):
        for row in response.get("results", []):
            if row.get("entry_id"):
                entry_ids.append(str(row["entry_id"]))
    return entry_ids


def delete_upload_manifest(args) -> None:
    entry_ids = _entry_ids_from_upload_manifest(Path(args.upload_manifest))
    if not entry_ids:
        raise SystemExit("No entry ids found in upload manifest")
    args.ids = ",".join(entry_ids)
    delete_ids(args)


def _entry_ids_from_entries_file(path: Path, memo_prefix: str) -> list[str]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    entry_ids = []
    for row in rows:
        if str(row.get("memo") or "").startswith(memo_prefix) and row.get("entry_id"):
            entry_ids.append(str(row["entry_id"]))
    return entry_ids


def delete_entries_file(args) -> None:
    entry_ids = _entry_ids_from_entries_file(Path(args.entries_file), args.memo_prefix)
    if not entry_ids:
        raise SystemExit("No matching entry ids found in entries file")
    args.ids = ",".join(entry_ids)
    delete_ids(args)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Whooing migration MVP tooling")
    subparsers = parser.add_subparsers(dest="command", required=True)

    snapshot_parser = subparsers.add_parser("snapshot", help="Fetch a non-destructive Whooing snapshot")
    snapshot_parser.add_argument("--start-date", required=True, help="YYYYMMDD")
    snapshot_parser.add_argument("--end-date", required=True, help="YYYYMMDD")
    snapshot_parser.set_defaults(func=snapshot)

    report_parser = subparsers.add_parser("report", help="Fetch a Whooing report")
    report_parser.add_argument("--account", default="assets,liabilities")
    report_parser.add_argument("--start-date", required=True, help="YYYYMMDD")
    report_parser.add_argument("--end-date", required=True, help="YYYYMMDD")
    report_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    report_parser.set_defaults(func=report)

    probe_parser = subparsers.add_parser("checkcard-probe", help="Probe native Whooing check-card behavior")
    probe_parser.add_argument("--expense-account-id", required=True)
    probe_parser.add_argument("--checkcard-account-id", required=True)
    probe_parser.add_argument("--linked-bank-account-id", required=True)
    probe_parser.add_argument("--amount", type=int, required=True)
    probe_parser.add_argument("--date", required=True, help="YYYYMMDD")
    probe_parser.set_defaults(func=checkcard_probe)

    dry_run_parser = subparsers.add_parser("dry-run", help="Build candidate Whooing entries without posting")
    dry_run_parser.add_argument("--start-date", required=True, help="YYYY-MM-DD")
    dry_run_parser.add_argument("--end-date", required=True, help="YYYY-MM-DD")
    dry_run_parser.add_argument("--checkcard-strategy", choices=["native", "paired"], default="native")
    dry_run_parser.set_defaults(func=dry_run)

    balanced_dry_run_parser = subparsers.add_parser(
        "balanced-dry-run",
        help="Build candidate entries with recalculated opening balances",
    )
    balanced_dry_run_parser.add_argument("--start-date", required=True, help="YYYY-MM-DD")
    balanced_dry_run_parser.add_argument("--end-date", required=True, help="YYYY-MM-DD")
    balanced_dry_run_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    balanced_dry_run_parser.set_defaults(func=balanced_dry_run)

    upload_parser = subparsers.add_parser("upload", help="Upload dry-run candidate entries to Whooing")
    upload_parser.add_argument("--candidate-file", required=True)
    upload_parser.add_argument("--offset", type=int, default=0)
    upload_parser.add_argument("--limit", type=int)
    upload_parser.add_argument("--batch-size", type=int, default=300)
    upload_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    upload_parser.add_argument("--yes", action="store_true")
    upload_parser.set_defaults(func=upload)

    reset_parser = subparsers.add_parser("reset-entries", help="Delete Whooing entries in a date range")
    reset_parser.add_argument("--start-date", required=True, help="YYYYMMDD")
    reset_parser.add_argument("--end-date", required=True, help="YYYYMMDD")
    reset_parser.add_argument("--limit", type=int)
    reset_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    reset_parser.add_argument("--yes", action="store_true")
    reset_parser.set_defaults(func=reset_entries)

    delete_ids_parser = subparsers.add_parser("delete-ids", help="Delete specific Whooing entry ids")
    delete_ids_parser.add_argument("--ids", required=True, help="Comma-separated entry ids")
    delete_ids_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    delete_ids_parser.add_argument("--yes", action="store_true")
    delete_ids_parser.set_defaults(func=delete_ids)

    delete_manifest_parser = subparsers.add_parser(
        "delete-upload-manifest",
        help="Delete entries created by an upload manifest",
    )
    delete_manifest_parser.add_argument("--upload-manifest", required=True)
    delete_manifest_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    delete_manifest_parser.add_argument("--yes", action="store_true")
    delete_manifest_parser.set_defaults(func=delete_upload_manifest)

    delete_entries_file_parser = subparsers.add_parser(
        "delete-entries-file",
        help="Delete entries listed in a snapshot entries.json file",
    )
    delete_entries_file_parser.add_argument("--entries-file", required=True)
    delete_entries_file_parser.add_argument("--memo-prefix", default="[MIG]")
    delete_entries_file_parser.add_argument("--sleep-seconds", type=float, default=3.0)
    delete_entries_file_parser.add_argument("--yes", action="store_true")
    delete_entries_file_parser.set_defaults(func=delete_entries_file)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
