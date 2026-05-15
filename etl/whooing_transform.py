from decimal import Decimal


def _absolute_money(value) -> Decimal:
    return abs(Decimal(str(value)))


def _migration_memo(tx: dict, suffix: str = "") -> str:
    approval = _absolute_money(tx.get("amount", tx["net_amount"]))
    net = _absolute_money(tx["net_amount"])
    discount = approval - net
    source = tx.get("source_ref", "")
    memo = f"[MIG] approval={approval:.0f}; net={net:.0f}; discount={discount:.0f}; src={source}"
    return f"{memo} {suffix}".rstrip()


def _expense_entry(tx: dict, r_account: str, r_account_id: str) -> dict:
    return {
        "l_account": "expenses",
        "l_account_id": tx["category_account_id"],
        "r_account": r_account,
        "r_account_id": r_account_id,
        "money": _absolute_money(tx["net_amount"]),
        "item": tx.get("description") or "",
        "memo": _migration_memo(tx),
    }


def transform_transaction(tx: dict, checkcard_strategy: str = "native") -> list[dict]:
    if _absolute_money(tx["net_amount"]) == 0:
        return []

    tx_type = tx["transaction_type"]
    if tx_type == "지출":
        account_kind = tx["account_kind"]
        if account_kind == "신용카드":
            return [_expense_entry(tx, "liabilities", tx["account_id"])]

        if account_kind == "체크카드":
            primary = _expense_entry(tx, "liabilities", tx["account_id"])
            if checkcard_strategy == "native":
                return [primary]
            if checkcard_strategy == "paired":
                settlement = {
                    "l_account": "liabilities",
                    "l_account_id": tx["account_id"],
                    "r_account": "assets",
                    "r_account_id": tx["linked_bank_account_id"],
                    "money": _absolute_money(tx["net_amount"]),
                    "item": tx.get("description") or "",
                    "memo": _migration_memo(tx, "[MIG:CHECKCARD_SETTLEMENT]"),
                }
                return [primary, settlement]
            raise ValueError(f"unknown checkcard_strategy: {checkcard_strategy}")

        return [_expense_entry(tx, "assets", tx["account_id"])]

    if tx_type == "수입":
        return [{
            "l_account": tx["account_type"],
            "l_account_id": tx["account_id"],
            "r_account": "income",
            "r_account_id": tx["category_account_id"],
            "money": _absolute_money(tx["net_amount"]),
            "item": tx.get("description") or "",
            "memo": _migration_memo(tx),
        }]

    if tx_type == "이체입금":
        return [{
            "l_account": tx["account_type"],
            "l_account_id": tx["account_id"],
            "r_account": tx["category_account_type"],
            "r_account_id": tx["category_account_id"],
            "money": _absolute_money(tx["net_amount"]),
            "item": tx.get("description") or "",
            "memo": _migration_memo(tx),
        }]

    if tx_type == "이체출금":
        return []

    if tx_type == "차액수입":
        return [{
            "l_account": tx["account_type"],
            "l_account_id": tx["account_id"],
            "r_account": "capital",
            "r_account_id": tx["capital_account_id"],
            "money": _absolute_money(tx["net_amount"]),
            "item": tx.get("description") or "",
            "memo": _migration_memo(tx),
        }]

    if tx_type == "차액지출":
        return [{
            "l_account": "capital",
            "l_account_id": tx["capital_account_id"],
            "r_account": tx["account_type"],
            "r_account_id": tx["account_id"],
            "money": _absolute_money(tx["net_amount"]),
            "item": tx.get("description") or "",
            "memo": _migration_memo(tx),
        }]

    raise ValueError(f"unsupported transaction_type for MVP: {tx_type}")
