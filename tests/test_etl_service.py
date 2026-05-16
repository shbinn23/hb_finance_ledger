import unittest
from unittest.mock import patch

from pydantic import ValidationError

from etl.service import WhooingSyncRequest, health, sync_whooing_entries


class EtlServiceTest(unittest.TestCase):
    def test_health_returns_ok(self):
        self.assertEqual(health(), {"ok": True})

    def test_sync_whooing_rejects_non_yyyymmdd_date(self):
        with self.assertRaises(ValidationError):
            WhooingSyncRequest(start_date="2026-05-15", end_date="20260515")

    def test_sync_whooing_rejects_reversed_date_range(self):
        with self.assertRaises(ValidationError):
            WhooingSyncRequest(start_date="20260516", end_date="20260515")

    @patch("etl.service.sync_whooing.sync")
    def test_sync_whooing_returns_sync_summary(self, sync):
        sync.return_value = {
            "start_date": "20260515",
            "end_date": "20260515",
            "fetched": 1,
            "upserted": 1,
            "deleted": 0,
        }

        response = sync_whooing_entries(
            WhooingSyncRequest(start_date="20260515", end_date="20260515"),
        )

        self.assertEqual(response, {
            "ok": True,
            "start_date": "20260515",
            "end_date": "20260515",
            "fetched": 1,
            "upserted": 1,
            "deleted": 0,
        })
        sync.assert_called_once_with(start_date="20260515", end_date="20260515")


if __name__ == "__main__":
    unittest.main()
