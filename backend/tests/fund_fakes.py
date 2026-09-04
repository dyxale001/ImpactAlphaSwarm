"""A fake Supabase client for the funds tests.

Extends the fake in ``test_supabase_repositories`` with the calls the funds
repositories make and it does not: ``or_``, ``ilike``, ``maybe_single``, the
keyword form of ``order``, ``upsert`` with its conflict arguments, and a storage
stub.

Not named ``test_*`` so pytest does not try to collect it, and importable without
a package because pytest puts the tests directory on the path.

It records rather than simulates. That is the point: these tests assert which
table was touched, which filters were applied and which ordering was asked for —
the things that break silently against a real database — and leave what
PostgREST does with a valid request to PostgREST.
"""

from __future__ import annotations

from typing import Any


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    """Records the fluent calls made against one table and replays canned rows."""

    def __init__(self, table: str, client: "FakeClient"):
        self.table_name = table
        self.client = client
        self.calls: list[tuple[str, tuple, dict]] = []
        self.payload: Any = None

    def _record(self, name: str, *args, **kw) -> "FakeQuery":
        self.calls.append((name, args, kw))
        return self

    def select(self, *a, **kw):
        return self._record("select", *a, **kw)

    def eq(self, *a, **kw):
        return self._record("eq", *a, **kw)

    def neq(self, *a, **kw):
        return self._record("neq", *a, **kw)

    def gt(self, *a, **kw):
        return self._record("gt", *a, **kw)

    def gte(self, *a, **kw):
        return self._record("gte", *a, **kw)

    def lt(self, *a, **kw):
        return self._record("lt", *a, **kw)

    def lte(self, *a, **kw):
        return self._record("lte", *a, **kw)

    def in_(self, *a, **kw):
        return self._record("in_", *a, **kw)

    def is_(self, *a, **kw):
        return self._record("is_", *a, **kw)

    def or_(self, *a, **kw):
        return self._record("or_", *a, **kw)

    def ilike(self, *a, **kw):
        return self._record("ilike", *a, **kw)

    def limit(self, *a, **kw):
        return self._record("limit", *a, **kw)

    def order(self, *a, **kw):
        return self._record("order", *a, **kw)

    def maybe_single(self, *a, **kw):
        return self._record("maybe_single", *a, **kw)

    def delete(self, *a, **kw):
        return self._record("delete", *a, **kw)

    def insert(self, payload, *a, **kw):
        self.payload = payload
        return self._record("insert", payload, *a, **kw)

    def update(self, payload, *a, **kw):
        self.payload = payload
        return self._record("update", payload, *a, **kw)

    def upsert(self, payload, *a, **kw):
        self.payload = payload
        return self._record("upsert", payload, *a, **kw)

    def execute(self):
        self.client.executed.append(self)
        if self.client.raises:
            raise RuntimeError("supabase is down")
        return FakeResponse(self.client.rows.get(self.table_name, []))


class FakeBucket:
    """Records uploads and signing requests for one storage bucket."""

    def __init__(self, name: str, store: "FakeStorage"):
        self.name = name
        self.store = store

    def upload(self, path, file, file_options=None):
        if self.store.raises:
            raise RuntimeError("storage is down")
        self.store.uploads.append((self.name, path, file, file_options))
        return {"path": path}

    def create_signed_url(self, path, expires_in):
        if self.store.raises:
            raise RuntimeError("storage is down")
        self.store.signed.append((self.name, path, expires_in))
        if self.store.signed_url is None:
            return {}
        return {"signedURL": self.store.signed_url}

    def remove(self, paths):
        self.store.removed.append((self.name, paths))
        return {}


class FakeStorage:
    def __init__(self, signed_url: str | None = "https://example.invalid/signed.pdf", raises: bool = False):
        self.signed_url = signed_url
        self.raises = raises
        self.uploads: list[tuple] = []
        self.signed: list[tuple] = []
        self.removed: list[tuple] = []
        self.buckets_used: list[str] = []

    def from_(self, bucket: str) -> FakeBucket:
        self.buckets_used.append(bucket)
        return FakeBucket(bucket, self)


class FakeClient:
    def __init__(self, rows=None, raises=False, storage=None):
        self.rows = rows or {}
        self.raises = raises
        self.executed: list[FakeQuery] = []
        self.queries: list[FakeQuery] = []
        self.storage = storage if storage is not None else FakeStorage()

    def table(self, name: str) -> FakeQuery:
        query = FakeQuery(name, self)
        self.queries.append(query)
        return query

    # ── assertions the tests read ───────────────────────────────────────────

    def tables_touched(self) -> list[str]:
        return [q.table_name for q in self.executed]

    def ops_on(self, table: str) -> list[str]:
        return [name for q in self.executed if q.table_name == table for name, _a, _k in q.calls]

    def calls_on(self, table: str) -> list[tuple[str, tuple, dict]]:
        return [call for q in self.executed if q.table_name == table for call in q.calls]

    def filters_on(self, table: str) -> list[tuple]:
        """The (column, value) pairs passed to eq() against one table."""
        return [args for name, args, _kw in self.calls_on(table) if name == "eq"]

    def orderings_on(self, table: str) -> list[tuple[tuple, dict]]:
        return [(args, kw) for name, args, kw in self.calls_on(table) if name == "order"]

    def payloads_on(self, table: str) -> list[Any]:
        return [q.payload for q in self.executed if q.table_name == table and q.payload is not None]
