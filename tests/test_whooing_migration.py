from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from etl.whooing_migration import (
    _chunks,
    _entry_ids_from_entries_file,
    _entry_ids_from_upload_manifest,
    _slice_entries,
    _upload_entry_payload,
)
from etl.whooing_mapper import WhooingMapper


class WhooingMigrationTest(unittest.TestCase):
    def test_chunks_splits_items_by_size(self):
        self.assertEqual(list(_chunks([1, 2, 3, 4, 5], 2)), [[1, 2], [3, 4], [5]])

    def test_slice_entries_applies_offset_and_limit(self):
        entries = [{"id": index} for index in range(5)]
        self.assertEqual(_slice_entries(entries, offset=2, limit=2), [{"id": 2}, {"id": 3}])

    def test_upload_entry_payload_strips_local_metadata(self):
        entry = {
            "entry_date": "20260515",
            "l_account": "expenses",
            "l_account_id": "x1",
            "r_account": "assets",
            "r_account_id": "x2",
            "item": "커피",
            "money": "4500.00",
            "memo": "[MIG] src=abc",
            "source_transaction_id": "abc",
        }
        self.assertEqual(_upload_entry_payload(entry), {
            "entry_date": "20260515",
            "l_account": "expenses",
            "l_account_id": "x1",
            "r_account": "assets",
            "r_account_id": "x2",
            "item": "커피",
            "money": "4500.00",
            "memo": "[MIG] src=abc",
        })

    def test_entry_ids_from_upload_manifest_includes_auto_created_rows(self):
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "upload.json"
            path.write_text(
                '{"responses":[{"results":[{"entry_id":1},{"entry_id":2}]},{"results":[{"entry_id":3}]}]}',
                encoding="utf-8",
            )
            self.assertEqual(_entry_ids_from_upload_manifest(path), ["1", "2", "3"])

    def test_entry_ids_from_entries_file_filters_by_memo_prefix(self):
        with TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "entries.json"
            path.write_text(
                '[{"entry_id":1,"memo":"[MIG] a"},{"entry_id":2,"memo":"manual"},{"entry_id":3,"memo":"[MIG] b"}]',
                encoding="utf-8",
            )
            self.assertEqual(_entry_ids_from_entries_file(path, "[MIG]"), ["1", "3"])

    def test_income_fallback_uses_default_income_account(self):
        ref = WhooingMapper({}).fallback_income()
        self.assertEqual(ref.account_type, "income")
        self.assertEqual(ref.account_id, "x10")


if __name__ == "__main__":
    unittest.main()
