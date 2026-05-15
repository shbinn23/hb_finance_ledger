from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class WhooingAccountRef:
    account_type: str
    account_id: str
    title: str
    category: str
    opt_pay_account_id: Optional[str] = None


class WhooingMapper:
    def __init__(self, refs: dict[str, WhooingAccountRef]):
        self.refs = refs

    @classmethod
    def load(cls, conn, section_id: str):
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT original_ref_id, account_type, account_id, title, category, opt_pay_account_id
                FROM whooing.accounts
                WHERE section_id = %s
                  AND item_type = 'account'
                  AND original_ref_id IS NOT NULL
                """,
                (section_id,),
            )
            refs = {
                row[0]: WhooingAccountRef(
                    account_type=row[1],
                    account_id=row[2],
                    title=row[3],
                    category=row[4] or "",
                    opt_pay_account_id=row[5] or None,
                )
                for row in cur.fetchall()
            }
        return cls(refs)

    def get(self, original_ref_id: str) -> WhooingAccountRef:
        original_ref_id = self._normalize_ref(original_ref_id)
        try:
            return self.refs[original_ref_id]
        except KeyError as exc:
            raise KeyError(f"No Whooing mapping for {original_ref_id}") from exc

    def fallback_income(self) -> WhooingAccountRef:
        return WhooingAccountRef(
            account_type="income",
            account_id="x10",
            title="기타수익",
            category="floating",
        )

    def _normalize_ref(self, original_ref_id: str) -> str:
        if original_ref_id == "CAT_f9d2fdc15d":
            return "CAT_d6323c2be9"
        if original_ref_id.startswith("CAT_") and original_ref_id not in self.refs:
            account_ref = "ACC_" + original_ref_id[4:]
            if account_ref in self.refs:
                return account_ref
        return original_ref_id
