"""A reader's uploaded funds stay theirs, and stay out of everything else.

Uploaded funds are read by a model and confirmed by one person, for that
person. They are not the catalogue: nobody chose them (D-153: no AI selects
funds), nobody else checked them, and they are private. So four guarantees,
each tested from the side that would break it:

  1. **The catalogue never sees an upload.** The browse grid, the matcher, a
     fund's page, its prices, the dashboard tiles (which call the catalogue
     endpoints), Compare and Ask all read through FundRepository. Nothing
     outside the upload code names an upload table or imports it, and the
     catalogue, run over a database holding a tempting upload, never returns
     it.
  2. **The upload code never writes the catalogue.** It reaches the database
     only through UploadedFundRepository, which touches only its four tables.
  3. **One reader cannot reach another's.** Through the HTTP surface, with the
     real service and repository.
  4. **The database agrees.** RLS on with no policies and no grants beyond
     service_role, no key into the catalogue tables, and with the flag off the
     upload code is not even loaded.

The nightly pipeline's distance from the whole funds package, uploads
included, is tested in test_funds_isolation.py.
"""

from __future__ import annotations

import ast
import datetime
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from fund_fakes import FakeClient  # noqa: E402
from test_funds_routes import (  # noqa: E402
    CONSERVATIVE_USER,
    ETF_SHEET,
    MM_SHEET,
    MONEY_MARKET,
    TODAY,
    TOP40_ETF,
)

from src.funds.repository import FundRepository, UserGoalsRepository  # noqa: E402
from src.funds.routes import current_user_id, get_service, mount_fund_catalogue  # noqa: E402
from src.funds.service import FundCatalogueService  # noqa: E402
from src.funds.upload_routes import get_upload_service, mount_fund_uploads  # noqa: E402
from src.funds.upload_service import FactSheetUploadService  # noqa: E402
from src.funds.uploads import UploadedFundRepository  # noqa: E402

UPLOAD_TABLES = frozenset({"uploaded_funds", "uploaded_fund_sheets", "fact_sheet_readings", "fact_sheet_reads"})
CATALOGUE_TABLES = frozenset({"funds", "fund_factsheet_snapshots", "asisa_categories", "fund_prices"})

UPLOAD_MODULES = frozenset({"src.funds.uploads", "src.funds.upload_service", "src.funds.upload_routes"})

#: Who may import which upload module. Each one is imported only by the layer
#: above it, and the app imports the routes, under the flag.
ALLOWED_IMPORTERS = {
    "src.funds.uploads": {"src/funds/upload_service.py"},
    "src.funds.upload_service": {"src/funds/upload_routes.py"},
    "src.funds.upload_routes": {"src/api.py"},
}

SRC = BACKEND_ROOT / "src"

USER = "u-1"
OTHER = "u-2"


def source_files():
    return sorted(p for p in SRC.rglob("*.py") if "__pycache__" not in p.parts)


def relative(path: Path) -> str:
    return path.relative_to(BACKEND_ROOT).as_posix()


def imported_modules(path: Path) -> set[str]:
    """Every module a file imports, with relative imports resolved."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    package = relative(path)[:-3].replace("/", ".").rsplit(".", 1)[0]
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = package.rsplit(".", node.level - 1)[0] if node.level > 1 else package
                module = f"{base}.{node.module}" if node.module else base
            else:
                module = node.module or ""
            found.add(module)
            # "from src.funds import uploads" names the module as an alias.
            found.update(f"{module}.{alias.name}" for alias in node.names)
    return found


def string_constants(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return {n.value for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str)}


def tables_touched(client: FakeClient) -> set[str]:
    return {query.table_name for query in client.executed}


# ── 1. the catalogue never sees an upload ───────────────────────────────────

class TestNothingElseKnowsTheUploadsExist:
    @pytest.mark.parametrize("path", source_files(), ids=relative)
    def test_only_the_upload_repository_names_an_upload_table(self, path):
        if relative(path) == "src/funds/uploads.py":
            return
        named = string_constants(path) & UPLOAD_TABLES
        assert not named, (
            f"{relative(path)} names {sorted(named)}. Uploaded funds are one reader's "
            f"own, read by a model; only src/funds/uploads.py may query them."
        )

    @pytest.mark.parametrize("path", source_files(), ids=relative)
    def test_the_upload_code_is_imported_only_by_the_layer_above_it(self, path):
        for module in imported_modules(path) & UPLOAD_MODULES:
            assert relative(path) in ALLOWED_IMPORTERS[module], (
                f"{relative(path)} imports {module}. Reach uploads through the "
                f"/api/fund-uploads routes, not by importing them."
            )

    def test_the_allowed_imports_are_still_how_it_is_wired(self):
        # So the allow-list above cannot quietly go stale.
        for module, importers in ALLOWED_IMPORTERS.items():
            for importer in importers:
                assert module in imported_modules(BACKEND_ROOT / importer), (importer, module)


UPLOADED_ID = str(uuid.uuid4())
UPLOADED_NAME = "Uploaded Private Money Market Fund"

# Shaped to be found: the same reader as the catalogue's matched user, a money
# market fund at risk level 1 (exactly what that conservative reader matches),
# active, with a sheet. If any catalogue path read these tables, it would show.
TEMPTING_UPLOAD = {
    **MONEY_MARKET,
    "id": UPLOADED_ID,
    "user_id": USER,
    "name": UPLOADED_NAME,
    "isin": "ZAE000999999",
}
TEMPTING_SHEET = {
    **MM_SHEET,
    "id": str(uuid.uuid4()),
    "uploaded_fund_id": UPLOADED_ID,
    "fund_id": UPLOADED_ID,
    "user_id": USER,
    "figures": {"ter": 0.1, "risk_indicator_1to5": 1},
}


def catalogue_over_a_database_with_uploads():
    client = FakeClient(
        rows={
            "funds": [MONEY_MARKET, TOP40_ETF],
            "fund_factsheet_snapshots": [MM_SHEET, ETF_SHEET],
            "uploaded_funds": [TEMPTING_UPLOAD],
            "uploaded_fund_sheets": [TEMPTING_SHEET],
            "fact_sheet_readings": [{"file_sha256": "x", "payload": {"fund_name": UPLOADED_NAME}}],
        }
    )
    users = FakeClient(rows={"user_analysis": [CONSERVATIVE_USER]})
    service = FundCatalogueService(
        funds=FundRepository(client), profiles=UserGoalsRepository(users), clock=lambda: TODAY
    )
    return service, client


def leaked(payload) -> bool:
    text = json.dumps(payload, default=str)
    return UPLOADED_NAME in text or UPLOADED_ID in text or "ZAE000999999" in text


class TestTheCatalogueNeverReturnsAnUpload:
    @pytest.fixture
    def api(self):
        service, client = catalogue_over_a_database_with_uploads()
        app = FastAPI()
        mount_fund_catalogue(app, enabled=True)
        app.dependency_overrides[get_service] = lambda: service
        app.dependency_overrides[current_user_id] = lambda: USER
        return TestClient(app), client

    @pytest.mark.parametrize("path", [
        "/api/fund-catalogue",
        "/api/fund-catalogue?q=Uploaded",
        "/api/fund-catalogue/meta",
        "/api/fund-catalogue/matches",
        "/api/fund-catalogue/f-mm",
        "/api/fund-catalogue/f-mm/prices",
    ])
    def test_no_catalogue_endpoint_returns_it(self, api, path):
        http, client = api
        response = http.get(path)
        assert response.status_code == 200, response.text
        assert not leaked(response.json())
        assert not tables_touched(client) & UPLOAD_TABLES

    def test_its_id_is_not_a_catalogue_fund(self, api):
        http, client = api
        assert http.get(f"/api/fund-catalogue/{UPLOADED_ID}").status_code == 404
        assert not tables_touched(client) & UPLOAD_TABLES

    def test_the_matcher_does_not_offer_it(self):
        service, client = catalogue_over_a_database_with_uploads()
        matches = service.matches_for(USER)
        assert not leaked(matches)
        assert not tables_touched(client) & UPLOAD_TABLES

    def test_no_catalogue_read_reaches_it(self):
        # The reads Ask (_resolve_fund) and Compare (funds_trace) go through.
        _, client = catalogue_over_a_database_with_uploads()
        repo = FundRepository(client)
        results = [
            repo.list_active(),
            repo.list_every(),
            repo.get(UPLOADED_ID),
            repo.get_by_isin("ZAE000999999"),
            repo.latest_snapshots([UPLOADED_ID]),
            repo.snapshots(UPLOADED_ID),
            repo.candidates(),
            repo.mancos(),
        ]
        assert not any(leaked(r) for r in results)
        assert not tables_touched(client) & UPLOAD_TABLES


# ── 2. the upload code never writes the catalogue ───────────────────────────

class TestTheUploadCodeOnlyTouchesItsOwnTables:
    NOW = datetime.datetime(2026, 10, 12, tzinfo=datetime.timezone.utc)

    def calls(self, repo: UploadedFundRepository):
        """Every public method, once. Listed by name so a new method fails the
        coverage check below until it is added here."""
        return {
            "cached_reading": lambda: repo.cached_reading("sha", "model", "2"),
            "store_reading": lambda: repo.store_reading("sha", "model", "2", True, {}, {}),
            "reads_since": lambda: repo.reads_since(USER, self.NOW),
            "record_read": lambda: repo.record_read(USER, "sha", False),
            "list_funds": lambda: repo.list_funds(USER),
            "get_fund": lambda: repo.get_fund(USER, UPLOADED_ID),
            "find_by_isin": lambda: repo.find_by_isin(USER, "ZAE000999999"),
            "find_by_name": lambda: repo.find_by_name(USER, UPLOADED_NAME),
            "create_fund": lambda: repo.create_fund(USER, {"name": "A fund"}),
            "update_fund": lambda: repo.update_fund(USER, UPLOADED_ID, {"name": "A fund"}),
            "add_sheet": lambda: repo.add_sheet(
                USER, UPLOADED_ID, {"as_of": "2026-08-31", "file_sha256": "sha", "figures": {}, "provenance": {}}
            ),
            "delete_fund": lambda: repo.delete_fund(USER, UPLOADED_ID),
        }

    def test_every_repository_method_stays_in_the_upload_tables(self):
        client = FakeClient(rows={"uploaded_funds": [TEMPTING_UPLOAD], "uploaded_fund_sheets": [TEMPTING_SHEET]})
        repo = UploadedFundRepository(client=client)
        for call in self.calls(repo).values():
            call()
        assert tables_touched(client) <= UPLOAD_TABLES
        assert tables_touched(client) == UPLOAD_TABLES  # and the check reached all four

    def test_the_list_above_covers_every_public_method(self):
        public = {
            name for name, value in vars(UploadedFundRepository).items()
            if callable(value) and not name.startswith("_")
        }
        assert public == set(self.calls(UploadedFundRepository(client=FakeClient())))

    @pytest.mark.parametrize("module", ["upload_service.py", "upload_routes.py", "reading.py"])
    def test_nothing_above_the_repository_reaches_the_database(self, module):
        path = SRC / "funds" / module
        source = path.read_text(encoding="utf-8")
        assert ".table(" not in source, f"{module} queries a table directly"
        assert not any("supabase" in m for m in imported_modules(path)), f"{module} imports the Supabase client"

    def test_the_upload_repository_names_no_catalogue_table(self):
        # The one upload module that does query tables. ("funds" is also the
        # logger's name elsewhere, which is why this is not checked above.)
        assert not string_constants(SRC / "funds" / "uploads.py") & CATALOGUE_TABLES


# ── 3. one reader cannot reach another's ────────────────────────────────────

MINE = str(uuid.uuid4())
THEIRS = str(uuid.uuid4())


class TestOneReaderCannotReachAnothers:
    """Through HTTP, with the real service and repository over one database
    holding both readers' funds."""

    @pytest.fixture
    def api(self):
        client = FakeClient(rows={
            "uploaded_funds": [
                {"id": MINE, "user_id": USER, "name": "My Fund", "isin": "ZAE000111111"},
                {"id": THEIRS, "user_id": OTHER, "name": "Their Fund", "isin": "ZAE000222222"},
            ],
            "uploaded_fund_sheets": [
                {"id": "s1", "uploaded_fund_id": MINE, "user_id": USER, "as_of": "2026-08-31"},
                {"id": "s2", "uploaded_fund_id": THEIRS, "user_id": OTHER, "as_of": "2026-08-31"},
            ],
        })
        service = FactSheetUploadService(repository=UploadedFundRepository(client=client), key=b"k")
        app = FastAPI()
        mount_fund_uploads(app, enabled=True)
        app.dependency_overrides[get_upload_service] = lambda: service
        app.dependency_overrides[current_user_id] = lambda: USER
        return TestClient(app), client

    def test_the_list_holds_only_their_own(self, api):
        http, _ = api
        body = http.get("/api/fund-uploads").json()
        assert [f["id"] for f in body] == [MINE]
        assert "Their Fund" not in json.dumps(body)

    def test_their_own_fund_carries_only_their_own_sheets(self, api):
        http, _ = api
        body = http.get(f"/api/fund-uploads/{MINE}").json()
        assert [s["id"] for s in body["sheets"]] == ["s1"]

    def test_anothers_fund_is_not_found(self, api):
        http, _ = api
        assert http.get(f"/api/fund-uploads/{THEIRS}").status_code == 404

    def test_anothers_fund_cannot_be_deleted(self, api):
        http, client = api
        assert http.delete(f"/api/fund-uploads/{THEIRS}").status_code == 404
        assert "delete" not in client.ops_on("uploaded_funds")


# ── 4. the database and the flag agree ──────────────────────────────────────

MIGRATIONS = BACKEND_ROOT / "migrations"


def without_comments(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


class TestTheDatabaseKeepsUploadsPrivate:
    SQL = without_comments((MIGRATIONS / "039_uploaded_funds.sql").read_text(encoding="utf-8")).lower()

    @pytest.mark.parametrize("table", sorted(UPLOAD_TABLES))
    def test_rls_is_on(self, table):
        assert f"alter table public.{table} enable row level security" in self.SQL

    @pytest.mark.parametrize("table", sorted(UPLOAD_TABLES))
    def test_only_the_backend_is_granted_anything(self, table):
        grants = re.findall(rf"grant [^;]* on public\.{table} to ([^;]+);", self.SQL)
        assert grants and all(g.strip() == "service_role" for g in grants), grants

    def test_no_migration_opens_them_to_the_browser(self):
        # Not 039 and not any later one: no policy, no grant to anon or
        # authenticated, ever, on an upload table.
        for path in sorted(MIGRATIONS.glob("*.sql")):
            sql = without_comments(path.read_text(encoding="utf-8")).lower()
            for table in UPLOAD_TABLES:
                assert not re.search(rf"create policy[^;]*on\s+(public\.)?{table}\b", sql), (path.name, table)
                assert not re.search(rf"grant[^;]*on\s+(public\.)?{table}\b[^;]*to[^;]*\b(anon|authenticated)\b", sql), (path.name, table)

    def test_the_upload_tables_have_no_key_into_the_catalogue(self):
        # A foreign key into `funds` would make an upload part of the
        # catalogue's data, and a cascade from it could reach a reader's list.
        for table in CATALOGUE_TABLES:
            assert f"public.{table} " not in self.SQL and f"public.{table}(" not in self.SQL, table
            assert f"references public.{table}" not in self.SQL


def loaded_with(env: dict[str, str]) -> tuple[list[str], list[str]]:
    """Import the whole API in a fresh interpreter with these flags, and report
    which upload modules loaded and which upload paths are served."""
    probe = (
        "import os, sys;"
        f"os.environ.update({env!r});"
        f"sys.path.insert(0, {str(BACKEND_ROOT)!r});"
        "import src.api;"
        "mods = sorted(m for m in sys.modules if m.startswith('src.funds.upload') or m == 'src.funds.reading');"
        "paths = sorted(p for p in src.api.app.openapi()['paths'] if p.startswith('/api/fund-uploads'));"
        "print(mods); print(paths)"
    )
    result = subprocess.run(
        [sys.executable, "-c", probe], cwd=str(BACKEND_ROOT), capture_output=True, text=True, timeout=180
    )
    assert result.returncode == 0, result.stderr[-1500:]
    mods, paths = result.stdout.strip().splitlines()[-2:]
    return ast.literal_eval(mods), ast.literal_eval(paths)


class TestTheFlag:
    def test_off_means_not_loaded_and_not_served(self):
        mods, paths = loaded_with({"FUNDS_ENABLED": "true", "FUND_UPLOADS_ENABLED": "false"})
        assert mods == [] and paths == []

    def test_on_needs_the_catalogue_flag_too(self):
        mods, paths = loaded_with({"FUNDS_ENABLED": "false", "FUND_UPLOADS_ENABLED": "true"})
        assert mods == [] and paths == []

    def test_on_serves_the_routes(self):
        _, paths = loaded_with({"FUNDS_ENABLED": "true", "FUND_UPLOADS_ENABLED": "true"})
        assert paths == ["/api/fund-uploads", "/api/fund-uploads/read", "/api/fund-uploads/{fund_id}"]
