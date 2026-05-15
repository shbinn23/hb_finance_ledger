import unittest

from etl import sync_whooing


class FakeWhooingClient:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def get_entries(self, start_date, end_date, limit_total=None):
        self.calls.append((start_date, end_date, limit_total))
        return self.rows


class SyncWhooingTest(unittest.TestCase):
    def test_fetch_entries_uses_paginated_whooing_client(self):
        rows = [{"entry_id": index} for index in range(150)]
        client = FakeWhooingClient(rows)

        result = sync_whooing.fetch_entries("20250731", "20260515", client=client)

        self.assertEqual(result, rows)
        self.assertEqual(client.calls, [("20250731", "20260515", None)])

    def test_entry_values_preserve_api_total_and_app_id(self):
        entry = {
            "entry_id": "1419000",
            "entry_date": "20260515.0001",
            "l_account": "expenses",
            "l_account_id": "x20",
            "r_account": "assets",
            "r_account_id": "x3",
            "item": "커피",
            "money": "4500",
            "total": "601198",
            "memo": "memo",
            "app_id": 123,
        }

        self.assertEqual(
            sync_whooing._entry_values(entry, "s1"),
            (
                "1419000",
                "s1",
                "20260515.0001",
                "expenses",
                "x20",
                "assets",
                "x3",
                "커피",
                "4500",
                "601198",
                "memo",
                123,
            ),
        )


if __name__ == "__main__":
    unittest.main()
