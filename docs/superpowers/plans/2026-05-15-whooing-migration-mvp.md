# Whooing Migration MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe MVP pipeline that resets/rebuilds the Whooing ledger from the current Easy Household Account Book-backed PostgreSQL data while preserving current balances, card liabilities, and check-card usage plus linked-bank balance effects.

**Architecture:** Keep `report.*` as the migration source and `whooing.*` as the API cache/reconciliation layer. Implement small CLI modules for API access, local balance targets, transformation, dry-run reconciliation, destructive reset, limited upload, and post-upload sync. Destructive API calls must require explicit CLI flags and must always run after a local backup/snapshot step.

**Tech Stack:** Python 3, psycopg2, requests, PostgreSQL `report` and `whooing` schemas, Whooing API, pytest for pure transformation tests.

---

## File Structure

- Create `etl/whooing_client.py`: authenticated Whooing API wrapper with throttling and explicit methods for accounts, entries, reports, checkcard, delete, and batch post.
- Create `etl/whooing_targets.py`: captured 2026-05-15 balance targets and account-name normalization helpers.
- Create `etl/whooing_mapper.py`: mapping loader from local `report.*` accounts/categories to Whooing account ids.
- Create `etl/whooing_transform.py`: pure transaction-to-entry conversion logic, including check-card strategies.
- Create `etl/whooing_reconcile.py`: local dry-run balance/monthly/card/checkcard reconciliation reports.
- Create `etl/whooing_migration.py`: CLI orchestration for `snapshot`, `checkcard-probe`, `dry-run`, `reset`, `upload`, and `sync`.
- Create `tests/test_whooing_transform.py`: pure tests for double-entry conversion and check-card handling.
- Modify `core/config.py`: accept both `DB_PASS` and existing `.env` `DB_PASSWORD` without leaking secrets.

## Safety Rules

- No Whooing delete call runs unless `--confirm-reset` is present.
- `reset` first writes local snapshots into `artifacts/whooing/YYYYMMDD-HHMMSS/`.
- `upload` first runs `dry-run` and exits if reconciliation has unexplained balance differences.
- Check-card migration must preserve both facts:
  - check-card usage is visible under the check-card account.
  - linked bank balance is reduced by the same spending.
- If native Whooing `checkcard` behavior satisfies both facts, use one entry: `expenses -> liabilities/checkcard`.
- If native behavior does not reduce linked bank balance, use paired entries:
  - `expenses -> liabilities/checkcard`
  - `liabilities/checkcard -> assets/linked_bank`
  The second entry must be tagged in `memo` as `[MIG:CHECKCARD_SETTLEMENT]` and excluded from expense reports.

---

### Task 1: Fix Local Configuration Compatibility

**Files:**
- Modify: `core/config.py`
- Test: manual import check

- [ ] **Step 1: Update settings to support `DB_PASSWORD`**

Replace the database password section with aliases that allow the current `.env` file to work.

```python
from pathlib import Path
from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = PROJECT_ROOT / "data"
    SQL_DIR: Path = PROJECT_ROOT / "sql" / "spending"

    DB_HOST: str = "localhost"
    DB_NAME: str = "postgres"
    DB_USER: str = "admin"
    DB_PASS: str = Field(default="1234", validation_alias=AliasChoices("DB_PASS", "DB_PASSWORD"))
    DB_PORT: int = 5432

    MONTHLY_SPEND_LIMIT: int = 2100000
    ML_ENGINE_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def db_url(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASS}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
```

- [ ] **Step 2: Verify config import**

Run:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/hb_finance_pycache python3 -c "from core.config import settings; print(settings.DB_HOST, settings.DB_NAME, bool(settings.DB_PASS))"
```

Expected: prints host, db name, and `True`; no password value is printed.

- [ ] **Step 3: Commit**

```bash
git add core/config.py
git commit -m "fix: support DB_PASSWORD env alias"
```

---

### Task 2: Add Captured Balance Targets

**Files:**
- Create: `etl/whooing_targets.py`
- Test: `python3 -m compileall etl/whooing_targets.py`

- [ ] **Step 1: Create balance target module**

```python
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
```

- [ ] **Step 2: Compile**

Run:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/hb_finance_pycache python3 -m compileall etl/whooing_targets.py
```

Expected: compile succeeds.

- [ ] **Step 3: Commit**

```bash
git add etl/whooing_targets.py
git commit -m "feat: add whooing migration balance targets"
```

---

### Task 3: Add Pure Transform Tests

**Files:**
- Create: `tests/test_whooing_transform.py`
- Create: `etl/whooing_transform.py`

- [ ] **Step 1: Write failing tests**

```python
from decimal import Decimal

from etl.whooing_transform import transform_transaction


def test_credit_card_expense_uses_card_liability():
    tx = {
        "transaction_type": "지출",
        "account_name": "하나 MG+S",
        "account_kind": "신용카드",
        "category_account_id": "x_food",
        "account_id": "x_card",
        "net_amount": Decimal("-12000"),
        "description": "점심",
        "transaction_date": "2026-05-01",
    }
    entries = transform_transaction(tx, checkcard_strategy="native")
    assert entries == [{
        "l_account": "expenses",
        "l_account_id": "x_food",
        "r_account": "liabilities",
        "r_account_id": "x_card",
        "money": Decimal("12000"),
        "item": "점심",
        "memo": "",
    }]


def test_check_card_native_keeps_checkcard_as_payment_method():
    tx = {
        "transaction_type": "지출",
        "account_name": "우체국 개이득",
        "account_kind": "체크카드",
        "category_account_id": "x_food",
        "account_id": "x_check",
        "linked_bank_account_id": "x_post",
        "net_amount": Decimal("-24260"),
        "description": "편의점",
        "transaction_date": "2026-05-01",
    }
    entries = transform_transaction(tx, checkcard_strategy="native")
    assert len(entries) == 1
    assert entries[0]["r_account_id"] == "x_check"


def test_check_card_paired_adds_bank_settlement_without_extra_expense():
    tx = {
        "transaction_type": "지출",
        "account_name": "우체국 개이득",
        "account_kind": "체크카드",
        "category_account_id": "x_food",
        "account_id": "x_check",
        "linked_bank_account_id": "x_post",
        "net_amount": Decimal("-24260"),
        "description": "편의점",
        "transaction_date": "2026-05-01",
    }
    entries = transform_transaction(tx, checkcard_strategy="paired")
    assert entries[0]["l_account"] == "expenses"
    assert entries[0]["r_account_id"] == "x_check"
    assert entries[1]["l_account"] == "liabilities"
    assert entries[1]["l_account_id"] == "x_check"
    assert entries[1]["r_account"] == "assets"
    assert entries[1]["r_account_id"] == "x_post"
    assert "[MIG:CHECKCARD_SETTLEMENT]" in entries[1]["memo"]
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
python3 -m pytest tests/test_whooing_transform.py -q
```

Expected: fails because `etl.whooing_transform` does not exist.

- [ ] **Step 3: Implement minimal transform module**

```python
from decimal import Decimal


def _money(value) -> Decimal:
    return abs(Decimal(str(value)))


def transform_transaction(tx: dict, checkcard_strategy: str = "native") -> list[dict]:
    tx_type = tx["transaction_type"]
    if tx_type != "지출":
        raise ValueError(f"unsupported transaction_type for MVP: {tx_type}")

    item = tx.get("description") or ""
    money = _money(tx["net_amount"])
    account_kind = tx["account_kind"]

    if account_kind == "신용카드":
        return [{
            "l_account": "expenses",
            "l_account_id": tx["category_account_id"],
            "r_account": "liabilities",
            "r_account_id": tx["account_id"],
            "money": money,
            "item": item,
            "memo": "",
        }]

    if account_kind == "체크카드":
        primary = {
            "l_account": "expenses",
            "l_account_id": tx["category_account_id"],
            "r_account": "liabilities",
            "r_account_id": tx["account_id"],
            "money": money,
            "item": item,
            "memo": "",
        }
        if checkcard_strategy == "native":
            return [primary]
        if checkcard_strategy == "paired":
            settlement = {
                "l_account": "liabilities",
                "l_account_id": tx["account_id"],
                "r_account": "assets",
                "r_account_id": tx["linked_bank_account_id"],
                "money": money,
                "item": item,
                "memo": "[MIG:CHECKCARD_SETTLEMENT]",
            }
            return [primary, settlement]
        raise ValueError(f"unknown checkcard_strategy: {checkcard_strategy}")

    return [{
        "l_account": "expenses",
        "l_account_id": tx["category_account_id"],
        "r_account": "assets",
        "r_account_id": tx["account_id"],
        "money": money,
        "item": item,
        "memo": "",
    }]
```

- [ ] **Step 4: Run tests and commit**

```bash
python3 -m pytest tests/test_whooing_transform.py -q
git add etl/whooing_transform.py tests/test_whooing_transform.py
git commit -m "feat: add whooing transaction transform"
```

---

### Task 4: Add Non-Destructive Whooing Snapshot

**Files:**
- Create: `etl/whooing_client.py`
- Create: `etl/whooing_migration.py`

- [ ] **Step 1: Implement client methods**

Create a client that reads `WHOOING_APP_ID`, `WHOOING_TOKEN`, `WHOOING_SIGNATURE`, and `WHOOING_SECTION_ID` from `.env` or process environment, sleeps 3 seconds after API calls, and exposes `get_entries(start_date, end_date)`, `get_accounts()`, `get_checkcard(start_ym, end_ym)`, and `delete_entry(entry_id)`.

- [ ] **Step 2: Implement `snapshot` CLI**

`python3 etl/whooing_migration.py snapshot --start-date 20200101 --end-date 20260515` must:

1. Create `artifacts/whooing/<timestamp>/`.
2. Fetch accounts into `accounts.json`.
3. Fetch entries in weekly windows into `entries.json`.
4. Fetch checkcard report into `checkcard.json`.
5. Print counts only, not secrets.

- [ ] **Step 3: Verify snapshot**

Run:

```bash
python3 etl/whooing_migration.py snapshot --start-date 20260501 --end-date 20260515
```

Expected: creates an artifact directory and prints fetched account/entry/checkcard counts.

- [ ] **Step 4: Commit**

```bash
git add etl/whooing_client.py etl/whooing_migration.py
git commit -m "feat: add whooing snapshot command"
```

---

### Task 5: Add Check-Card Probe

**Files:**
- Modify: `etl/whooing_migration.py`
- Modify: `etl/whooing_client.py`

- [ ] **Step 1: Add `checkcard-probe` command**

The command must require:

```bash
python3 etl/whooing_migration.py checkcard-probe \
  --expense-account-id <expense_xid> \
  --checkcard-account-id <checkcard_xid> \
  --linked-bank-account-id <bank_xid> \
  --amount 1000 \
  --date 20260515
```

It must post one entry `expenses -> liabilities/checkcard`, fetch `checkcard`, `in_out/assets`, and account reports before/after, print the delta, and delete the probe entry at the end.

- [ ] **Step 2: Verify decision output**

Expected output must end with exactly one of:

```text
CHECKCARD_STRATEGY=native
CHECKCARD_STRATEGY=paired
```

- [ ] **Step 3: Commit**

```bash
git add etl/whooing_client.py etl/whooing_migration.py
git commit -m "feat: add whooing checkcard probe"
```

---

### Task 6: Add Dry-Run Reconciliation

**Files:**
- Create: `etl/whooing_mapper.py`
- Create: `etl/whooing_reconcile.py`
- Modify: `etl/whooing_migration.py`

- [ ] **Step 1: Load local transactions**

Query `report.fact_transactions` joined to `report.dim_account`, `report.dim_account_type`, and `report.dim_category` for a user-provided date range.

- [ ] **Step 2: Transform entries without posting**

For each row, map local account/category to Whooing account ids, transform using `checkcard_strategy`, and write `artifacts/whooing/<timestamp>/candidate_entries.json`.

- [ ] **Step 3: Compare against captured targets**

Generate `reconciliation.md` with:

```text
account_name | target | simulated | diff | status
```

The command exits non-zero if unexplained diffs exist for captured target accounts.

- [ ] **Step 4: Verify dry-run**

Run:

```bash
python3 etl/whooing_migration.py dry-run --start-date 20260501 --end-date 20260515 --checkcard-strategy paired
```

Expected: writes candidate entries and reconciliation report; no API writes.

- [ ] **Step 5: Commit**

```bash
git add etl/whooing_mapper.py etl/whooing_reconcile.py etl/whooing_migration.py
git commit -m "feat: add whooing migration dry run"
```

---

### Task 7: Add Controlled Reset and Upload

**Files:**
- Modify: `etl/whooing_migration.py`
- Modify: `etl/whooing_client.py`

- [ ] **Step 1: Add reset command**

`reset` must refuse to run unless both flags are present:

```bash
python3 etl/whooing_migration.py reset --confirm-reset --snapshot-first
```

The command must run `snapshot`, then delete entries one by one until the target date range returns zero entries.

- [ ] **Step 2: Add upload command**

`upload` must read `candidate_entries.json`, post in batches of at most 300, and write `upload_result.json` mapping local source rows to Whooing entry ids.

- [ ] **Step 3: Add post-upload sync**

After upload, fetch entries weekly into `whooing.entries` and verify API count equals local uploaded count.

- [ ] **Step 4: Commit**

```bash
git add etl/whooing_client.py etl/whooing_migration.py
git commit -m "feat: add controlled whooing reset and upload"
```

---

## Execution Order

1. Task 1 and Task 2 are safe local prep.
2. Task 3 proves check-card conversion logic in isolation.
3. Task 4 creates a backup path before any reset.
4. Task 5 determines `native` vs `paired` check-card strategy.
5. Task 6 runs against current PostgreSQL data with no API writes.
6. Task 7 performs reset/upload only after reconciliation is explainable.

## Self-Review

- Captured balances from the user screenshots are included as explicit targets.
- Destructive Whooing operations are gated behind `--confirm-reset` and `--snapshot-first`.
- The check-card requirement is covered by both tests and runtime probe.
- The plan avoids changing the Next.js dashboard until migration correctness is proven.
- The plan does not rely on Claude Code artifacts or missing files from earlier work.
