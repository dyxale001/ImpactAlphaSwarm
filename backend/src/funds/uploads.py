"""Database access for uploaded fact sheets (migration 039).

One repository over the four upload tables, with the ``Repository`` contract:
a failed READ degrades to an empty result and prints, a failed WRITE raises.
For a reader's own data the asymmetry matters most on the write side: a save
that reported success while writing nothing would lose figures the person had
just checked by hand.

**Every query that touches a reader's rows filters by ``user_id``**, including
reads and deletes by a row's own id. The backend holds the service-role key, so
row-level security does not bind it; the owner filter in each method is what
stops one reader's request reaching another reader's fund. The tests assert it
on every method.
"""

from __future__ import annotations

import datetime
from typing import Any, Optional

from ..utils.supabase_client import Repository

FUND_COLUMNS = "id,user_id,name,fund_house,isin,jse_code,vehicle,asisa_category,created_at,updated_at"
SHEET_COLUMNS = (
    "id,uploaded_fund_id,user_id,as_of,file_sha256,figures,provenance,model,prompt_version,confirmed_at"
)

#: The identity fields a fund row takes; anything else in a patch is ignored, so
#: a caller cannot write user_id or id through an update.
IDENTITY_FIELDS = ("name", "fund_house", "isin", "jse_code", "vehicle", "asisa_category")


class UploadedFundRepository(Repository):
    """A reader's uploaded funds, their confirmed sheets, and the reading cache."""

    table_name = "uploaded_funds"
    sheets_table = "uploaded_fund_sheets"
    readings_table = "fact_sheet_readings"
    reads_table = "fact_sheet_reads"

    # ── the reading cache (shared, holds no reader's data) ──────────────────

    def cached_reading(self, file_sha256: str, model: str, prompt_version: str) -> Optional[dict[str, Any]]:
        """The model's stored answer for this document, or None."""
        try:
            resp = (
                self.table(self.readings_table)
                .select("is_fact_sheet,payload,tokens")
                .eq("file_sha256", file_sha256)
                .eq("model", model)
                .eq("prompt_version", prompt_version)
                .limit(1)
                .execute()
            )
            return resp.data[0] if resp.data else None
        except Exception as e:
            print(f"Error reading the fact sheet cache: {e}")
            return None

    def store_reading(
        self,
        file_sha256: str,
        model: str,
        prompt_version: str,
        is_fact_sheet: bool,
        payload: Optional[dict[str, Any]],
        tokens: Optional[dict[str, int]],
    ) -> None:
        """Keep the model's answer for the next reader of the same document.

        A document that is not a fact sheet keeps only that verdict: its payload
        is dropped here, whatever the caller passed, so nothing read from a
        private document is ever stored.
        """
        self.table(self.readings_table).upsert(
            {
                "file_sha256": file_sha256,
                "model": model,
                "prompt_version": prompt_version,
                "is_fact_sheet": bool(is_fact_sheet),
                "payload": payload if is_fact_sheet else None,
                "tokens": tokens,
            },
            on_conflict="file_sha256,model,prompt_version",
        ).execute()

    # ── the daily limit ─────────────────────────────────────────────────────

    def reads_since(self, user_id: str, since: datetime.datetime) -> int:
        """How many uploads this reader has made since a moment.

        Fails OPEN to the limit rather than to zero: if the count cannot be read,
        it reports a number so large that the caller refuses the upload, because
        a limit that vanishes whenever the database hiccups is no limit.
        """
        try:
            resp = (
                self.table(self.reads_table)
                .select("id")
                .eq("user_id", user_id)
                .gte("created_at", since.isoformat())
                .execute()
            )
            return len(resp.data or [])
        except Exception as e:
            print(f"Error counting fact sheet reads for a reader: {e}")
            return 10**6

    def record_read(self, user_id: str, file_sha256: str, cached: bool) -> None:
        self.table(self.reads_table).insert(
            {"user_id": user_id, "file_sha256": file_sha256, "cached": bool(cached)}
        ).execute()

    # ── a reader's funds ────────────────────────────────────────────────────

    def list_funds(self, user_id: str) -> list[dict[str, Any]]:
        """This reader's funds, newest first, each with its latest sheet as ``sheet``."""
        try:
            funds = (
                self.table()
                .select(FUND_COLUMNS)
                .eq("user_id", user_id)
                .order("updated_at", desc=True)
                .execute()
            ).data or []
            if not funds:
                return []
            sheets = (
                self.table(self.sheets_table)
                .select(SHEET_COLUMNS)
                .eq("user_id", user_id)
                .in_("uploaded_fund_id", [f["id"] for f in funds])
                .order("as_of", desc=True)
                .order("confirmed_at", desc=True)
                .execute()
            ).data or []
        except Exception as e:
            print(f"Error listing a reader's uploaded funds: {e}")
            return []
        latest: dict[str, dict[str, Any]] = {}
        for sheet in sheets:
            latest.setdefault(sheet["uploaded_fund_id"], sheet)
        return [dict(fund, sheet=latest.get(fund["id"])) for fund in funds]

    def get_fund(self, user_id: str, fund_id: str) -> Optional[dict[str, Any]]:
        """One of this reader's funds with every sheet, newest first, or None
        when it does not exist or is not theirs (the two are not told apart)."""
        try:
            rows = (
                self.table()
                .select(FUND_COLUMNS)
                .eq("id", fund_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            ).data or []
            if not rows:
                return None
            sheets = (
                self.table(self.sheets_table)
                .select(SHEET_COLUMNS)
                .eq("uploaded_fund_id", fund_id)
                .eq("user_id", user_id)
                .order("as_of", desc=True)
                .order("confirmed_at", desc=True)
                .execute()
            ).data or []
        except Exception as e:
            print(f"Error fetching an uploaded fund: {e}")
            return None
        return dict(rows[0], sheets=sheets)

    def find_by_isin(self, user_id: str, isin: str) -> Optional[dict[str, Any]]:
        """This reader's fund with this ISIN, so a second upload extends it."""
        try:
            rows = (
                self.table()
                .select(FUND_COLUMNS)
                .eq("user_id", user_id)
                .eq("isin", isin)
                .limit(1)
                .execute()
            ).data or []
            return rows[0] if rows else None
        except Exception as e:
            print(f"Error finding an uploaded fund by ISIN: {e}")
            return None

    def create_fund(self, user_id: str, identity: dict[str, Any]) -> dict[str, Any]:
        payload = {k: identity.get(k) for k in IDENTITY_FIELDS}
        payload["user_id"] = user_id
        resp = self.table().insert(payload).execute()
        return (resp.data or [payload])[0]

    def update_fund(self, user_id: str, fund_id: str, identity: dict[str, Any]) -> None:
        """Refresh a fund's identity from its newest confirmed sheet."""
        payload = {k: identity[k] for k in IDENTITY_FIELDS if k in identity}
        payload["updated_at"] = self._now_iso()
        self.table().update(payload).eq("id", fund_id).eq("user_id", user_id).execute()

    def add_sheet(self, user_id: str, fund_id: str, sheet: dict[str, Any]) -> dict[str, Any]:
        """Store one confirmed sheet. Confirming the same document twice for the
        same date replaces the first confirmation rather than duplicating it."""
        payload = {
            "uploaded_fund_id": fund_id,
            "user_id": user_id,
            "as_of": sheet["as_of"],
            "file_sha256": sheet["file_sha256"],
            "figures": sheet["figures"],
            "provenance": sheet["provenance"],
            "model": sheet.get("model"),
            "prompt_version": sheet.get("prompt_version"),
            "confirmed_at": self._now_iso(),
        }
        resp = (
            self.table(self.sheets_table)
            .upsert(payload, on_conflict="uploaded_fund_id,as_of,file_sha256")
            .execute()
        )
        return (resp.data or [payload])[0]

    def delete_fund(self, user_id: str, fund_id: str) -> None:
        """Remove one of this reader's funds; its sheets go with it (on delete cascade)."""
        self.table().delete().eq("id", fund_id).eq("user_id", user_id).execute()
