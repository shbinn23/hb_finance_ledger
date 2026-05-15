from decimal import Decimal
import unittest

from etl.whooing_transform import transform_transaction


class WhooingTransformTest(unittest.TestCase):
    def test_zero_net_amount_creates_no_entry(self):
        tx = {
            "transaction_type": "지출",
            "account_name": "하나 MG+S",
            "account_kind": "신용카드",
            "category_account_id": "x_fee",
            "account_id": "x_card",
            "amount": Decimal("0"),
            "net_amount": Decimal("0"),
            "description": "연회비",
            "transaction_date": "2026-05-01",
            "source_ref": "TX_0",
        }
        self.assertEqual(transform_transaction(tx, checkcard_strategy="native"), [])

    def test_credit_card_expense_uses_net_amount_as_whooing_money(self):
        tx = {
            "transaction_type": "지출",
            "account_name": "하나 MG+S",
            "account_kind": "신용카드",
            "category_account_id": "x_food",
            "account_id": "x_card",
            "amount": Decimal("-12000"),
            "net_amount": Decimal("-11400"),
            "description": "점심",
            "transaction_date": "2026-05-01",
            "source_ref": "TX_1",
        }
        entries = transform_transaction(tx, checkcard_strategy="native")
        self.assertEqual(entries, [{
            "l_account": "expenses",
            "l_account_id": "x_food",
            "r_account": "liabilities",
            "r_account_id": "x_card",
            "money": Decimal("11400"),
            "item": "점심",
            "memo": "[MIG] approval=12000; net=11400; discount=600; src=TX_1",
        }])


    def test_check_card_native_keeps_checkcard_as_payment_method(self):
        tx = {
            "transaction_type": "지출",
            "account_name": "우체국 개이득",
            "account_kind": "체크카드",
            "category_account_id": "x_food",
            "account_id": "x_check",
            "linked_bank_account_id": "x_post",
            "amount": Decimal("-24260"),
            "net_amount": Decimal("-24260"),
            "description": "편의점",
            "transaction_date": "2026-05-01",
            "source_ref": "TX_2",
        }
        entries = transform_transaction(tx, checkcard_strategy="native")
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["money"], Decimal("24260"))
        self.assertEqual(entries[0]["r_account_id"], "x_check")


    def test_check_card_paired_adds_bank_settlement_without_extra_expense(self):
        tx = {
            "transaction_type": "지출",
            "account_name": "우체국 개이득",
            "account_kind": "체크카드",
            "category_account_id": "x_food",
            "account_id": "x_check",
            "linked_bank_account_id": "x_post",
            "amount": Decimal("-24260"),
            "net_amount": Decimal("-24260"),
            "description": "편의점",
            "transaction_date": "2026-05-01",
            "source_ref": "TX_3",
        }
        entries = transform_transaction(tx, checkcard_strategy="paired")
        self.assertEqual(entries[0]["l_account"], "expenses")
        self.assertEqual(entries[0]["r_account_id"], "x_check")
        self.assertEqual(entries[0]["money"], Decimal("24260"))
        self.assertEqual(entries[1]["l_account"], "liabilities")
        self.assertEqual(entries[1]["l_account_id"], "x_check")
        self.assertEqual(entries[1]["r_account"], "assets")
        self.assertEqual(entries[1]["r_account_id"], "x_post")
        self.assertEqual(entries[1]["money"], Decimal("24260"))
        self.assertIn("[MIG:CHECKCARD_SETTLEMENT]", entries[1]["memo"])

    def test_transfer_into_credit_card_decreases_liability_from_bank(self):
        tx = {
            "transaction_type": "이체입금",
            "account_name": "롯데 라이킷",
            "account_kind": "신용카드",
            "account_type": "liabilities",
            "account_id": "x51",
            "category_account_type": "assets",
            "category_account_id": "x3",
            "amount": Decimal("46769"),
            "net_amount": Decimal("46769"),
            "description": "카드정산 결제",
            "transaction_date": "2026-05-14",
            "source_ref": "TX_4",
        }
        entries = transform_transaction(tx, checkcard_strategy="native")
        self.assertEqual(entries[0]["l_account"], "liabilities")
        self.assertEqual(entries[0]["l_account_id"], "x51")
        self.assertEqual(entries[0]["r_account"], "assets")
        self.assertEqual(entries[0]["r_account_id"], "x3")

    def test_income_into_check_card_uses_liability_account_type(self):
        tx = {
            "transaction_type": "수입",
            "account_name": "우체국 개이득",
            "account_kind": "체크카드",
            "account_type": "liabilities",
            "account_id": "x91",
            "category_account_id": "x90",
            "amount": Decimal("4470"),
            "net_amount": Decimal("4470"),
            "description": "유튜브 프리미엄",
            "transaction_date": "2025-10-21",
            "source_ref": "TX_5",
        }
        entries = transform_transaction(tx, checkcard_strategy="native")
        self.assertEqual(entries[0]["l_account"], "liabilities")
        self.assertEqual(entries[0]["l_account_id"], "x91")
        self.assertEqual(entries[0]["r_account"], "income")
        self.assertEqual(entries[0]["r_account_id"], "x90")


if __name__ == "__main__":
    unittest.main()
