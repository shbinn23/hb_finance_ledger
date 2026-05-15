import hashlib
import json
import threading
from collections import OrderedDict
from typing import Any, Callable, TypeVar

T = TypeVar("T")


def stable_hash(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class TaskCache:
    def __init__(self, max_entries: int = 64):
        self.max_entries = max_entries
        self._values: OrderedDict[str, Any] = OrderedDict()
        self._inflight: dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def get_or_compute(self, key: str, compute: Callable[[], T]) -> tuple[T, bool]:
        with self._lock:
            if key in self._values:
                value = self._values.pop(key)
                self._values[key] = value
                return value, True

            event = self._inflight.get(key)
            if event is None:
                event = threading.Event()
                self._inflight[key] = event
                owner = True
            else:
                owner = False

        if owner:
            try:
                value = compute()
                with self._lock:
                    self._values[key] = value
                    while len(self._values) > self.max_entries:
                        self._values.popitem(last=False)
                return value, False
            finally:
                with self._lock:
                    self._inflight.pop(key, None)
                    event.set()

        event.wait()

        with self._lock:
            if key in self._values:
                value = self._values.pop(key)
                self._values[key] = value
                return value, True

        value = compute()
        with self._lock:
            self._values[key] = value
            while len(self._values) > self.max_entries:
                self._values.popitem(last=False)
        return value, False
