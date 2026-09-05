"""Database access for the funds catalogue.

Two repositories over the existing ``Repository`` base, and they inherit its
contract as well as its constructor: a failed READ degrades to an empty result
and prints, a failed WRITE propagates. That asymmetry is deliberate here for the
same reason it is there — a page that renders without a fund is a bad page, but
a seed loader that reports success while writing nothing is a lie the next
person has to discover.

There is no database view behind ``latest_snapshots``. Picking the newest sheet
per fund is a ``distinct on``, which the PostgREST client cannot express, so the
approved sheets come back in one ordered request and the first row per fund
wins. At catalogue scale that is a few hundred rows; if it ever is not, the view
goes in and this method's callers do not change.

``UserGoalsRepository`` reads ``user_analysis`` itself rather than extending
``UserRepository.preferences``, which selects everything and then discards
``survey_answers``. A funds-owned reader keeps this feature out of
``supabase_client``, the file every weekly merge touches.
"""

from __future__ import annotations

import hashlib
from typing import Any, Optional, Sequence

from ..utils.supabase_client import Repository, normalize_risk_tolerance
from .asisa import ASISA_VERSION
from .config import MDD_BUCKET, MDD_SIGNED_URL_TTL_SECONDS
from .models import FundCandidate, Goals, Profile

# Explicit column lists, following the DISCOVERY_POOL_COLUMNS precedent: the
# request says what it needs, so adding a column to the table does not silently
# widen every payload.
FUND_COLUMNS = (
    "id,isin,name,fund_house,manco,vehicle,is_index_tracker,jse_code,yahoo_symbol,"
    "asisa_geography,asisa_asset_class,asisa_category,tfsa_eligible,platforms,"
    "mdd_page_url,curation_rule,is_active,updated_at"
)

SNAPSHOT_COLUMNS = (
    "id,fund_id,as_of,mdd_url,mdd_sha256,risk_indicator_raw,risk_indicator_1to5,"
    "recommended_min_term_years,objective,asset_allocation,benchmark,ter,tc,tic,"
    "performance,top_holdings,min_lump_sum,min_debit_order,distribution_frequency,"
    "fund_size_zar,source,entered_by,reviewed_by,review_status,mdd_pdf_ref,created_at"
)

APPROVED = "approved"

# PostgREST's horizontal filters use `*` as the wildcard, and treat comma, dot
# and parenthesis as syntax. A search term goes into an `or_` string, so those
# characters are removed rather than escaped: a fund name has never needed one,
# and a broken filter string fails as a confusing 400 rather than as no results.
_FILTER_UNSAFE = str.maketrans({c: None for c in ",.()*%\"'\\"})


def _searchable(term: str) -> str:
    return " ".join(term.translate(_FILTER_UNSAFE).split())[:60]


class FundRepository(Repository):
    """The fund catalogue, its dated fact sheets, and the archived documents."""

    table_name = "funds"
    snapshots_table = "fund_factsheet_snapshots"
    categories_table = "asisa_categories"
    prices_table = "fund_prices"

    # ── reads: degrade, never raise ─────────────────────────────────────────

    def list_active(self, filters: Any = None) -> list[dict[str, Any]]:
        """Active funds, filtered, ordered by name.

        Alphabetical at the database rather than in the caller, because the
        ordering is a stated rule on the page: no fund is placed above another
        by its returns, so there is no other ordering to choose from.
        """
        try:
            query = self.table().select(FUND_COLUMNS).eq("is_active", True)

            if filters is not None:
                for column, value in (
                    ("vehicle", getattr(filters, "vehicle", None)),
                    ("asisa_geography", getattr(filters, "geography", None)),
                    ("asisa_asset_class", getattr(filters, "asset_class", None)),
                    ("asisa_category", getattr(filters, "category", None)),
                    ("manco", getattr(filters, "manco", None)),
                ):
                    if value:
                        query = query.eq(column, value)

                if getattr(filters, "tfsa", None) is True:
                    query = query.eq("tfsa_eligible", True)

                term = getattr(filters, "query", None)
                if term:
                    cleaned = _searchable(str(term))
                    if cleaned:
                        query = query.or_(
                            f"name.ilike.*{cleaned}*,"
                            f"fund_house.ilike.*{cleaned}*,"
                            f"isin.ilike.*{cleaned}*"
                        )

            resp = query.order("name").execute()
            return resp.data or []
        except Exception as e:
            print(f"Error listing funds: {e}")
            return []

    def list_every(self) -> list[dict[str, Any]]:
        """Every fund, retired ones included, for the admin list.

        The public list shows only active funds; whoever maintains the catalogue
        has to see the retired ones too, because reviving one is how a fund
        comes back — there is no delete to undo.
        """
        try:
            resp = self.table().select(FUND_COLUMNS).order("name").execute()
            return resp.data or []
        except Exception as e:
            print(f"Error listing every fund: {e}")
            return []

    def get(self, fund_id: str) -> Optional[dict[str, Any]]:
        try:
            resp = self.table().select(FUND_COLUMNS).eq("id", fund_id).limit(1).execute()
            data = resp.data or []
            return data[0] if data else None
        except Exception as e:
            print(f"Error fetching fund {fund_id}: {e}")
            return None

    def get_by_isin(self, isin: str) -> Optional[dict[str, Any]]:
        try:
            resp = self.table().select(FUND_COLUMNS).eq("isin", isin).limit(1).execute()
            data = resp.data or []
            return data[0] if data else None
        except Exception as e:
            print(f"Error fetching fund by isin {isin}: {e}")
            return None

    def latest_snapshots(self, fund_ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        """The newest approved fact sheet per fund, in one round trip.

        Only approved sheets: an extracted row awaiting review must never reach
        a user, because the whole claim of the page is that every figure came
        off a published document someone checked.
        """
        if not fund_ids:
            return {}
        try:
            resp = (
                self.table(self.snapshots_table)
                .select(SNAPSHOT_COLUMNS)
                .in_("fund_id", list(fund_ids))
                .eq("review_status", APPROVED)
                .order("as_of", desc=True)
                .order("created_at", desc=True)
                .execute()
            )
            newest: dict[str, dict[str, Any]] = {}
            for row in resp.data or []:
                fund_id = row.get("fund_id")
                # First row per fund wins: the ordering above put the most
                # recent sheet, and the latest correction to it, first.
                if fund_id and fund_id not in newest:
                    newest[fund_id] = row
            return newest
        except Exception as e:
            print(f"Error fetching latest fund snapshots: {e}")
            return {}

    def snapshots(self, fund_id: str) -> list[dict[str, Any]]:
        """One approved sheet per date for one fund, newest first.

        The history a unit trust has no price feed for: over time these rows are
        the only record of how a fund's costs and allocation moved.

        A fact sheet is identified by its date, so the history shows one entry
        per date — the latest reading of it. The table is append-only, so a
        corrected transcription arrives as a second row for a date that already
        has one; both are kept as the audit trail, and the superseded reading is
        not a second month of history. Showing both would report the same sheet
        twice and invite the reader to treat a fixed mistake as a change in the
        fund.
        """
        try:
            resp = (
                self.table(self.snapshots_table)
                .select(SNAPSHOT_COLUMNS)
                .eq("fund_id", fund_id)
                .eq("review_status", APPROVED)
                .order("as_of", desc=True)
                .order("created_at", desc=True)
                .execute()
            )
            # Ordered newest-correction-first above, so the first row seen for a
            # date is the one to keep. Done here rather than in the query because
            # PostgREST cannot express `distinct on`.
            newest_per_date: dict[Any, dict[str, Any]] = {}
            for row in resp.data or []:
                newest_per_date.setdefault(row.get("as_of"), row)
            return list(newest_per_date.values())
        except Exception as e:
            print(f"Error fetching snapshots for fund {fund_id}: {e}")
            return []

    def candidates(self, filters: Any = None) -> list[FundCandidate]:
        """Active funds paired with their newest approved sheet.

        Two requests, not one per fund. A fund with no approved sheet still comes
        back, with ``snapshot`` None — it cannot match, and it is still listed.
        """
        funds = self.list_active(filters)
        newest = self.latest_snapshots([f["id"] for f in funds if f.get("id")])
        return [FundCandidate(fund=f, snapshot=newest.get(f.get("id"))) for f in funds]

    def asisa_categories(self, version: str = ASISA_VERSION) -> list[dict[str, Any]]:
        try:
            resp = (
                self.table(self.categories_table)
                .select("version,code,tier1,tier2,tier3,name")
                .eq("version", version)
                .order("name")
                .execute()
            )
            return resp.data or []
        except Exception as e:
            print(f"Error fetching asisa categories: {e}")
            return []

    def mancos(self) -> list[str]:
        """Distinct management companies, for the browse filter."""
        try:
            resp = self.table().select("manco").eq("is_active", True).execute()
            names = {row.get("manco") for row in (resp.data or []) if row.get("manco")}
            return sorted(names)
        except Exception as e:
            print(f"Error fetching fund managers: {e}")
            return []

    # ── writes: propagate, so a loader can fail loudly ──────────────────────

    def upsert_fund(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        """Insert or update one fund, keyed on its ISIN.

        Deliberately not wrapped: the seed loader has to exit non-zero when a
        write fails, and the admin interface has to show the error rather than
        report a save that did not happen.
        """
        payload = dict(row)
        payload["updated_at"] = self._now_iso()
        resp = self.table().upsert(payload, on_conflict="isin").execute()
        return resp.data or []

    @staticmethod
    def transcription_hash(isin: str, snapshot: dict[str, Any]) -> str:
        """Stand-in for a fact sheet's own hash, when no PDF has been archived.

        Snapshots de-duplicate on ``(fund_id, as_of, mdd_sha256)``. With a PDF on
        file that hash is the document's; without one it has to be derived, and
        what it is derived from decides whether a correction can ever land.

        It covers **every transcribed value**, not just which document they came
        from. Hashing only isin/date/url — which is what this did first — makes
        re-runs idempotent and silently discards every correction: the sheet is
        the same, so a fixed figure looks like a duplicate. The Satrix 40 risk
        rating sat wrong in a live database for exactly that reason.

        Lives here rather than in the loader so the CSV path and the admin form
        cannot drift apart on a rule this quiet.
        """
        fields = {
            k: v for k, v in snapshot.items()
            if k not in ("fund_id", "mdd_sha256", "mdd_pdf_ref", "id", "created_at")
        }
        parts = "|".join(f"{k}={fields[k]!r}" for k in sorted(fields))
        return hashlib.sha256(f"{isin}|{parts}".encode()).hexdigest()

    def update_fund(self, fund_id: str, patch: dict[str, Any]) -> list[dict[str, Any]]:
        """Change some columns of one fund, addressed by its id.

        Separate from ``upsert_fund`` because that one is keyed on ISIN and
        writes a whole row: the admin interface edits a fund that already exists
        and must not be able to move it onto another ISIN by mistake. ``isin``
        and ``id`` are therefore dropped from the patch rather than trusted.

        Not wrapped, for the same reason as the other writes: a save that did
        not happen must not be reported as one.
        """
        payload = {k: v for k, v in patch.items() if k not in ("id", "isin")}
        payload["updated_at"] = self._now_iso()
        resp = self.table().update(payload).eq("id", fund_id).execute()
        return resp.data or []

    def insert_snapshot(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        """Record one fact sheet.

        Ignores a document already stored for that fund and date, which is what
        makes re-running the loader safe. A genuinely re-issued sheet has a
        different hash and lands as a new row rather than replacing anything.
        """
        resp = (
            self.table(self.snapshots_table)
            .upsert(
                dict(row),
                on_conflict="fund_id,as_of,mdd_sha256",
                ignore_duplicates=True,
            )
            .execute()
        )
        return resp.data or []

    # ── the archived documents ──────────────────────────────────────────────

    @staticmethod
    def mdd_object_path(isin: str, as_of: str) -> str:
        """Where one fact sheet is archived: ``<isin>/<as_of>.pdf``.

        Deterministic so a re-run overwrites its own copy instead of
        accumulating duplicates, and so a path can be rebuilt from a snapshot
        row without storing it twice.
        """
        return f"{isin}/{as_of}.pdf"

    def upload_mdd(self, isin: str, as_of: str, pdf: bytes) -> str:
        """Archive a fact-sheet PDF and return its storage path.

        Upserting: the same document re-fetched is the same bytes, and a
        corrected one for the same month should replace the copy at that path
        while the snapshot row records both hashes.
        """
        path = self.mdd_object_path(isin, as_of)
        self.client.storage.from_(MDD_BUCKET).upload(
            path,
            pdf,
            {"content-type": "application/pdf", "upsert": "true"},
        )
        return path

    def signed_mdd_url(
        self,
        mdd_pdf_ref: Optional[str],
        ttl_seconds: int = MDD_SIGNED_URL_TTL_SECONDS,
    ) -> Optional[str]:
        """A short-lived link to our archived copy, or None.

        A read, so it degrades: the page links to the manager's own URL first
        and this is the fallback, so failing to sign one costs a fallback rather
        than the page.
        """
        if not mdd_pdf_ref:
            return None
        try:
            signed = self.client.storage.from_(MDD_BUCKET).create_signed_url(
                mdd_pdf_ref, ttl_seconds
            )
            if isinstance(signed, dict):
                return signed.get("signedURL") or signed.get("signedUrl")
            return None
        except Exception as e:
            print(f"Error signing fact sheet url {mdd_pdf_ref}: {e}")
            return None


class UserGoalsRepository(Repository):
    """The two fields a fund match is allowed to read from a user's record."""

    table_name = "user_analysis"

    def profile(self, user_id: str) -> Optional[Profile]:
        """The risk label and goal answers for one user, or None.

        None means no onboarding record at all — an admin account, or a user who
        has not finished. The caller says so rather than showing an empty match
        list, because the two look identical and only one is the user's to fix.
        """
        try:
            resp = (
                self.table()
                .select("risk_tolerance,survey_answers")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            data = resp.data or []
            if not data:
                return None
            row = data[0]
            return Profile(
                user_id=user_id,
                # Normalised for the same reason it is normalised in the
                # pipeline: the raw column holds mixed casing and a typo, and an
                # exact-match comparison silently skips those rows.
                risk_tolerance=normalize_risk_tolerance(row.get("risk_tolerance")),
                goals=Goals.from_survey_answers(row.get("survey_answers")),
            )
        except Exception as e:
            print(f"Error fetching fund profile for {user_id}: {e}")
            return None
