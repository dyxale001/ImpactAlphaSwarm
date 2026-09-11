"""Minimal fake of the supabase-py chainable query builder, just enough to
exercise the Admin Reports aggregation endpoints without a live Supabase
project. Not a general-purpose mock — it supports exactly the operations
backend/src/api.py's report endpoints use: select/eq/gte/lt/in_/order/limit/
maybe_single, with count="exact" head=True for row counts, and .execute()
returning an object with .data and .count.
"""
from __future__ import annotations


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, rows, *, count_mode=None):
        self._rows = list(rows)
        self._count_mode = count_mode  # "exact" when count="exact" was requested

    def select(self, *_args, count=None, head=False, **_kwargs):
        self._count_mode = count
        return self

    def eq(self, col, value):
        self._rows = [r for r in self._rows if r.get(col) == value]
        return self

    def gte(self, col, value):
        self._rows = [r for r in self._rows if r.get(col) is not None and r.get(col) >= value]
        return self

    def lt(self, col, value):
        self._rows = [r for r in self._rows if r.get(col) is not None and r.get(col) < value]
        return self

    def in_(self, col, values):
        values = set(values)
        self._rows = [r for r in self._rows if r.get(col) in values]
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    def maybe_single(self):
        self._single = True
        return self

    def insert(self, payload):
        self._insert_payload = payload
        return self

    def execute(self):
        if getattr(self, "_insert_payload", None) is not None:
            self._rows.append(dict(self._insert_payload))
            return _Resp(self._rows[-1:])
        if getattr(self, "_single", False):
            return _Resp(self._rows[0] if self._rows else None)
        count = len(self._rows) if self._count_mode == "exact" else None
        return _Resp(self._rows, count=count)


class FakeSupabase:
    """In-memory stand-in for the `supabase` client used by src.api.

    Usage: FakeSupabase({"users": [...], "ai_runs": [...]}) then
    monkeypatch.setattr(api, "supabase", fake).
    """

    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables = {k: list(v) for k, v in (tables or {}).items()}

    def table(self, name: str) -> _Query:
        return _Query(self.tables.get(name, []))
