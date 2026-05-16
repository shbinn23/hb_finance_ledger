import json
import os
import random
import time
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


class WhooingClient:
    def __init__(self, sleep_seconds: float = 3.0):
        self.app_id = os.getenv("WHOOING_APP_ID")
        self.token = os.getenv("WHOOING_TOKEN")
        self.signature = os.getenv("WHOOING_SIGNATURE")
        self.section_id = os.getenv("WHOOING_SECTION_ID")
        self.base_url = "https://whooing.com/api"
        self.sleep_seconds = sleep_seconds

        missing = [
            name for name, value in {
                "WHOOING_APP_ID": self.app_id,
                "WHOOING_TOKEN": self.token,
                "WHOOING_SIGNATURE": self.signature,
                "WHOOING_SECTION_ID": self.section_id,
            }.items()
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing Whooing env vars: {', '.join(missing)}")

    def _api_key(self) -> str:
        nounce = "".join(random.choices("0123456789abcdef", k=32))
        timestamp = int(time.time())
        return (
            f"app_id={self.app_id},token={self.token},signature={self.signature},"
            f"nounce={nounce},timestamp={timestamp}"
        )

    def request(self, method: str, path: str, params: Optional[dict[str, Any]] = None,
                data: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = {"X-API-KEY": self._api_key()}
        try:
            response = requests.request(
                method,
                url,
                headers=headers,
                params=params,
                data=data,
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
            if payload.get("code") not in (None, 200):
                raise RuntimeError(json.dumps(payload, ensure_ascii=False))
            return payload
        finally:
            time.sleep(self.sleep_seconds)

    def get_accounts(self) -> dict[str, Any]:
        return self.request("GET", "accounts.json", params={"section_id": self.section_id})

    def sort_accounts(self, account: str, account_ids: list[str]) -> dict[str, Any]:
        data = {
            "section_id": self.section_id,
            "account_ids": ",".join(account_ids),
        }
        return self.request("PUT", f"accounts/{account}/sort.json", data=data)

    def get_entries(self, start_date: str, end_date: str, limit_total: Optional[int] = None) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        max_cursor = None
        while True:
            page_limit = 100
            if limit_total is not None:
                remaining = limit_total - len(rows)
                if remaining <= 0:
                    break
                page_limit = min(page_limit, remaining)
            params = {
                "section_id": self.section_id,
                "start_date": start_date,
                "end_date": end_date,
                "limit": page_limit,
            }
            if max_cursor is not None:
                params["max"] = max_cursor
            payload = self.request("GET", "entries.json", params=params)
            batch = payload.get("results", {}).get("rows", [])
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < page_limit:
                break
            max_cursor = min(row["entry_date"] for row in batch if row.get("entry_date"))
        return rows

    def get_checkcard(self, start_ym: str, end_ym: str) -> dict[str, Any]:
        return self.request(
            "GET",
            "checkcard.json",
            params={"section_id": self.section_id, "start_date": start_ym, "end_date": end_ym},
        )

    def get_in_out_account(self, account: str, account_id: str, start_date: str, end_date: str) -> dict[str, Any]:
        return self.request(
            "GET",
            f"in_out/{account}/{account_id}.json",
            params={"section_id": self.section_id, "start_date": start_date, "end_date": end_date},
        )

    def get_report(self, account: str, start_date: str, end_date: str) -> dict[str, Any]:
        return self.request(
            "GET",
            "report.json",
            params={
                "section_id": self.section_id,
                "account": account,
                "start_date": start_date,
                "end_date": end_date,
                "rows_type": "none",
            },
        )

    def post_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        data = {"section_id": self.section_id, **entry}
        return self.request("POST", "entries.json", data=data)

    def post_entries(self, entries: list[dict[str, Any]]) -> dict[str, Any]:
        data = {
            "section_id": self.section_id,
            "data_type": "json",
            "entries": json.dumps(entries, ensure_ascii=False),
        }
        return self.request("POST", "entries.json", data=data)

    def delete_entry(self, entry_id) -> dict[str, Any]:
        return self.request("DELETE", f"entries/{entry_id}/{self.section_id}.json")

    def delete_entries(self, entry_ids: list[str]) -> dict[str, Any]:
        return self.request("DELETE", f"entries/{','.join(map(str, entry_ids))}/{self.section_id}.json")
