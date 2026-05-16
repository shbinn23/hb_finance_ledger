import unittest

from etl.refresh_whooing_accounts import diff_accounts, local_only_accounts, normalize_accounts_payload


class RefreshWhooingAccountsTest(unittest.TestCase):
    def test_normalize_accounts_payload_assigns_global_sort_order(self):
        payload = {
            "results": {
                "assets": [
                    {"account_id": "x1", "type": "group", "title": "입출금"},
                    {"account_id": "x2", "type": "account", "title": "은행", "category": "normal"},
                ],
                "liabilities": [
                    {
                        "account_id": "x3",
                        "type": "account",
                        "title": "카드",
                        "category": "creditcard",
                        "opt_use_date": "p1",
                        "opt_pay_date": 25,
                    },
                ],
            },
        }

        rows = normalize_accounts_payload(payload, "s1")

        self.assertEqual([row["account_id"] for row in rows], ["x1", "x2", "x3"])
        self.assertEqual([row["sort_order"] for row in rows], [0, 1, 2])
        self.assertEqual(rows[0]["item_type"], "group")
        self.assertEqual(rows[2]["opt_use_date"], "p1")

    def test_diff_accounts_detects_updates_without_deletes(self):
        api_rows = [
            {
                "account_id": "x1",
                "section_id": "s1",
                "account_type": "assets",
                "item_type": "account",
                "title": "새 이름",
                "memo": "",
                "open_date": 20200101,
                "close_date": 29991231,
                "category": "normal",
                "opt_use_date": None,
                "opt_pay_date": None,
                "opt_pay_account_id": None,
                "sort_order": 0,
            },
        ]
        local_rows = {
            ("x1", "s1"): {
                **api_rows[0],
                "title": "옛 이름",
            },
            ("x2", "s1"): {
                **api_rows[0],
                "account_id": "x2",
                "title": "API에 없는 로컬 계정",
            },
        }

        diffs = diff_accounts(api_rows, local_rows)

        self.assertEqual(len(diffs), 1)
        self.assertEqual(diffs[0]["action"], "update")
        self.assertEqual(diffs[0]["changed_fields"], ["title"])

        local_only = local_only_accounts(api_rows, local_rows)
        self.assertEqual([row["account_id"] for row in local_only], ["x2"])

    def test_diff_accounts_compares_zero_as_a_real_value(self):
        api_row = {
            "account_id": "x1",
            "section_id": "s1",
            "account_type": "assets",
            "item_type": "account",
            "title": "은행",
            "memo": "",
            "open_date": 20200101,
            "close_date": 29991231,
            "category": "normal",
            "opt_use_date": None,
            "opt_pay_date": None,
            "opt_pay_account_id": None,
            "sort_order": 0,
        }

        self.assertEqual(
            diff_accounts([api_row], {("x1", "s1"): {**api_row, "sort_order": None}})[0]["changed_fields"],
            ["sort_order"],
        )


if __name__ == "__main__":
    unittest.main()
