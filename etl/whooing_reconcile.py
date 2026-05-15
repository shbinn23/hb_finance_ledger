from collections import Counter, defaultdict
from decimal import Decimal


def entry_balance_deltas(entry: dict) -> dict[tuple[str, str], Decimal]:
    money = Decimal(str(entry["money"]))
    deltas: dict[tuple[str, str], Decimal] = defaultdict(Decimal)

    l_key = (entry["l_account"], entry["l_account_id"])
    r_key = (entry["r_account"], entry["r_account_id"])

    if entry["l_account"] == "assets":
        deltas[l_key] += money
    elif entry["l_account"] == "liabilities":
        deltas[l_key] -= money

    if entry["r_account"] == "assets":
        deltas[r_key] -= money
    elif entry["r_account"] == "liabilities":
        deltas[r_key] += money

    return dict(deltas)


def apply_entry_balance_deltas(balances: dict[tuple[str, str], Decimal], entry: dict) -> None:
    for key, delta in entry_balance_deltas(entry).items():
        balances[key] += delta


def summarize_entries(entries: list[dict], skipped: Counter, unmapped: list[str]) -> str:
    by_pair = Counter((entry["l_account"], entry["r_account"]) for entry in entries)
    lines = [
        "# Whooing Migration Dry Run",
        "",
        f"candidate_entries: {len(entries)}",
        f"skipped_transactions: {sum(skipped.values())}",
        f"unmapped_transactions: {len(unmapped)}",
        "",
        "## Entry Pairs",
        "",
        "| left | right | count |",
        "| --- | --- | ---: |",
    ]
    for (left, right), count in sorted(by_pair.items()):
        lines.append(f"| {left} | {right} | {count} |")

    lines.extend(["", "## Skipped Transactions", "", "| reason | count |", "| --- | ---: |"])
    for reason, count in sorted(skipped.items()):
        lines.append(f"| {reason} | {count} |")

    if unmapped:
        lines.extend(["", "## Unmapped", ""])
        for item in unmapped[:100]:
            lines.append(f"- {item}")
        if len(unmapped) > 100:
            lines.append(f"- ... {len(unmapped) - 100} more")

    return "\n".join(lines) + "\n"
