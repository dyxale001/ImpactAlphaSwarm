"""Tests for the funds repositories and the row validators.

Two claims for the repositories. The first is that they honour the base's
contract: reads degrade to an empty result, writes propagate — because the seed
loader's exit code is the only thing standing between a half-written catalogue
and a page that looks fine. The second is that the requests are shaped right:
which table, which filters, which ordering. Those are what break silently
against a real database, and a fake that records them is the only cheap way to
pin them.

For the validators the claim is narrower and more important: the failures they
catch are plausible wrong numbers, not crashes. A total expense ratio of 146,
an allocation summing to 60, a risk level that contradicts the words printed
beside it. Every one of those would render perfectly.

No Supabase, no network.
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fund_fakes import FakeClient, FakeStorage  # noqa: E402
from src.funds.models import FundFilters, Profile  # noqa: E402
from src.funds.repository import (  # noqa: E402
    APPROVED,
    FundRepository,
    UserGoalsRepository,
)
from src.funds.validators import (  # noqa: E402
    ERROR,
    WARNING,
    AllocationValidator,
    AsisaCategoryValidator,
    FeeRelationValidator,
    FreshnessValidator,
    IsinValidator,
    NumericRangeValidator,
    Problem,
    RiskLabelValidator,
    RowValidator,
    ValidatorChain,
    VehicleConsistencyValidator,
    as_number,
    fund_validators,
    snapshot_validators,
)

TODAY = date(2026, 9, 4)

FUND_ROW = {
    "id": "f-1",
    "isin": "ZAE000027108",
    "name": "Example Top 40 ETF",
    "fund_house": "Example",
    "manco": "Example Managers (RF) (Pty) Ltd",
    "vehicle": "etf",
    "is_index_tracker": True,
    "jse_code": "EXM40",
    "yahoo_symbol": "EXM40.JO",
    "asisa_geography": "South African",
    "asisa_asset_class": "Equity",
    "asisa_category": "South African - Equity - SA General",
    "tfsa_eligible": True,
}


def snapshot(fund_id="f-1", as_of="2026-07-31", **overrides):
    row = {
        "id": f"s-{fund_id}-{as_of}",
        "fund_id": fund_id,
        "as_of": as_of,
        "mdd_url": "https://manager.invalid/sheet.pdf",
        "mdd_sha256": f"hash-{as_of}",
        "risk_indicator_raw": "Moderate",
        "risk_indicator_1to5": 3,
        "review_status": APPROVED,
        "ter": 1.26,
        "tc": 0.09,
        "tic": 1.35,
    }
    row.update(overrides)
    return row


# ═════════════════════════════════════════════════════════════════════════════
# FundRepository
# ═════════════════════════════════════════════════════════════════════════════

class TestItInheritsTheBaseContract:
    def test_it_is_a_repository_and_names_its_tables(self):
        assert issubclass(FundRepository, RowValidator) is False  # sanity: not confused
        assert FundRepository.table_name == "funds"
        assert FundRepository.snapshots_table == "fund_factsheet_snapshots"
        assert FundRepository.categories_table == "asisa_categories"

    def test_an_injected_client_is_used_instead_of_the_module_one(self):
        client = FakeClient()
        FundRepository(client).list_active()
        assert client.tables_touched() == ["funds"]

    @pytest.mark.parametrize(
        "call,expected",
        [
            (lambda r: r.list_active(), []),
            (lambda r: r.get("f-1"), None),
            (lambda r: r.get_by_isin("ZAE000027108"), None),
            (lambda r: r.latest_snapshots(["f-1"]), {}),
            (lambda r: r.snapshots("f-1"), []),
            (lambda r: r.asisa_categories(), []),
            (lambda r: r.mancos(), []),
            (lambda r: r.candidates(), []),
        ],
    )
    def test_every_read_degrades_when_the_database_is_down(self, call, expected):
        # A page missing a fund is a bad page. A page that 500s is a broken app,
        # and the funds section is not important enough to take the app down.
        assert call(FundRepository(FakeClient(raises=True))) == expected

    def test_writes_propagate_when_the_database_is_down(self):
        # The opposite choice, for the opposite reason: the seed loader must not
        # report success for rows it never wrote.
        repo = FundRepository(FakeClient(raises=True))
        with pytest.raises(RuntimeError):
            repo.upsert_fund(dict(FUND_ROW))
        with pytest.raises(RuntimeError):
            repo.insert_snapshot(snapshot())


class TestListingAndFiltering:
    def test_only_active_funds_are_listed(self):
        client = FakeClient()
        FundRepository(client).list_active()
        assert ("is_active", True) in client.filters_on("funds")

    def test_ordering_is_alphabetical_at_the_database(self):
        # The page states that no fund is placed above another by its returns,
        # so the ordering has to be something else and has to be deterministic.
        client = FakeClient()
        FundRepository(client).list_active()
        assert client.orderings_on("funds") == [(("name",), {})]

    def test_each_filter_becomes_one_equality(self):
        client = FakeClient()
        FundRepository(client).list_active(
            FundFilters(
                vehicle="unit_trust",
                geography="South African",
                asset_class="Multi Asset",
                category="South African - Multi Asset - Income",
                manco="Example Managers (RF) (Pty) Ltd",
                tfsa=True,
            )
        )
        applied = dict(client.filters_on("funds"))
        assert applied["vehicle"] == "unit_trust"
        assert applied["asisa_geography"] == "South African"
        assert applied["asisa_asset_class"] == "Multi Asset"
        assert applied["asisa_category"] == "South African - Multi Asset - Income"
        assert applied["manco"] == "Example Managers (RF) (Pty) Ltd"
        assert applied["tfsa_eligible"] is True

    def test_tfsa_false_is_not_a_filter(self):
        # "Not tax-free eligible" is not a thing anyone browses for; only the
        # positive filter is offered, so False must not narrow the list.
        client = FakeClient()
        FundRepository(client).list_active(FundFilters(tfsa=False))
        assert ("tfsa_eligible", True) not in client.filters_on("funds")

    def test_a_search_term_looks_across_name_house_and_isin(self):
        client = FakeClient()
        FundRepository(client).list_active(FundFilters(query="satrix"))
        or_calls = [args[0] for name, args, _kw in client.calls_on("funds") if name == "or_"]
        assert len(or_calls) == 1
        assert "name.ilike.*satrix*" in or_calls[0]
        assert "fund_house.ilike.*satrix*" in or_calls[0]
        assert "isin.ilike.*satrix*" in or_calls[0]

    @pytest.mark.parametrize("term", ["a,b", "a.b", "a)b(", "a*b", "a%b", 'a"b', "a'b"])
    def test_filter_syntax_characters_are_stripped_from_a_search_term(self, term):
        # A comma or a parenthesis inside an or_ string is syntax, not text. An
        # unescaped one fails as a confusing 400 rather than as no results.
        client = FakeClient()
        FundRepository(client).list_active(FundFilters(query=term))
        or_calls = [args[0] for name, args, _kw in client.calls_on("funds") if name == "or_"]
        assert or_calls, "the search should still run"
        for char in ",.()*%\"'":
            assert f"ilike.*{char}" not in or_calls[0]

    def test_a_search_term_of_only_syntax_is_dropped(self):
        client = FakeClient()
        FundRepository(client).list_active(FundFilters(query=",,,"))
        assert not [name for name, _a, _k in client.calls_on("funds") if name == "or_"]


class TestLatestSnapshots:
    def test_it_asks_for_approved_sheets_newest_first(self):
        client = FakeClient()
        FundRepository(client).latest_snapshots(["f-1", "f-2"])
        assert client.tables_touched() == ["fund_factsheet_snapshots"]
        assert ("review_status", APPROVED) in client.filters_on("fund_factsheet_snapshots")
        assert client.orderings_on("fund_factsheet_snapshots") == [
            (("as_of",), {"desc": True}),
            (("created_at",), {"desc": True}),
        ]

    def test_the_newest_sheet_per_fund_wins(self):
        # The ordering is the database's job; keeping the first row per fund is
        # this method's. Rows arrive in the order the query asked for.
        client = FakeClient(
            rows={
                "fund_factsheet_snapshots": [
                    snapshot("f-1", "2026-07-31", mdd_sha256="newest"),
                    snapshot("f-1", "2026-06-30", mdd_sha256="older"),
                    snapshot("f-2", "2026-05-31", mdd_sha256="f2-only"),
                ]
            }
        )
        newest = FundRepository(client).latest_snapshots(["f-1", "f-2"])
        assert newest["f-1"]["mdd_sha256"] == "newest"
        assert newest["f-2"]["mdd_sha256"] == "f2-only"

    def test_a_correction_for_the_same_month_wins_over_the_original(self):
        # Two sheets share an as_of; created_at desc put the correction first.
        client = FakeClient(
            rows={
                "fund_factsheet_snapshots": [
                    snapshot("f-1", "2026-07-31", mdd_sha256="corrected", created_at="2026-08-20"),
                    snapshot("f-1", "2026-07-31", mdd_sha256="original", created_at="2026-08-05"),
                ]
            }
        )
        newest = FundRepository(client).latest_snapshots(["f-1"])
        assert newest["f-1"]["mdd_sha256"] == "corrected"

    def test_no_fund_ids_means_no_request_at_all(self):
        client = FakeClient()
        assert FundRepository(client).latest_snapshots([]) == {}
        assert client.tables_touched() == []


class TestCandidates:
    def test_a_fund_without_an_approved_sheet_still_comes_back(self):
        # It can never match — there is no published risk label to compare — but
        # it is in the catalogue and belongs in the browse view.
        client = FakeClient(rows={"funds": [FUND_ROW], "fund_factsheet_snapshots": []})
        candidates = FundRepository(client).candidates()
        assert len(candidates) == 1
        assert candidates[0].snapshot is None
        assert candidates[0].risk_level is None

    def test_a_fund_is_paired_with_its_own_sheet(self):
        client = FakeClient(
            rows={
                "funds": [FUND_ROW, dict(FUND_ROW, id="f-2", isin="ZAE000000002")],
                "fund_factsheet_snapshots": [snapshot("f-2", "2026-07-31")],
            }
        )
        candidates = FundRepository(client).candidates()
        paired = {c.fund["id"]: c.snapshot for c in candidates}
        assert paired["f-1"] is None
        assert paired["f-2"]["fund_id"] == "f-2"

    def test_it_reads_funds_once_and_snapshots_once(self):
        # Not one request per fund: a catalogue page that fans out per row is
        # how a fast page becomes a slow one as the catalogue grows.
        client = FakeClient(rows={"funds": [FUND_ROW, dict(FUND_ROW, id="f-2")]})
        FundRepository(client).candidates()
        assert client.tables_touched() == ["funds", "fund_factsheet_snapshots"]


class TestWrites:
    def test_a_fund_is_upserted_on_its_isin_and_stamped(self):
        client = FakeClient()
        FundRepository(client).upsert_fund(dict(FUND_ROW))
        call = [c for c in client.calls_on("funds") if c[0] == "upsert"][0]
        assert call[2]["on_conflict"] == "isin"
        assert "updated_at" in call[1][0]

    def test_a_snapshot_is_keyed_on_the_document_and_ignores_duplicates(self):
        # This is what makes re-running the loader safe: the same document twice
        # is a no-op, while a re-issued sheet has a different hash and lands.
        client = FakeClient()
        FundRepository(client).insert_snapshot(snapshot())
        call = [c for c in client.calls_on("fund_factsheet_snapshots") if c[0] == "upsert"][0]
        assert call[2]["on_conflict"] == "fund_id,as_of,mdd_sha256"
        assert call[2]["ignore_duplicates"] is True


class TestArchivedDocuments:
    def test_the_storage_path_is_derived_not_stored_twice(self):
        assert FundRepository.mdd_object_path("ZAE000027108", "2026-07-31") == "ZAE000027108/2026-07-31.pdf"

    def test_uploading_uses_the_private_bucket_and_upserts(self):
        storage = FakeStorage()
        repo = FundRepository(FakeClient(storage=storage))
        path = repo.upload_mdd("ZAE000027108", "2026-07-31", b"%PDF-1.5 ...")
        assert path == "ZAE000027108/2026-07-31.pdf"
        bucket, uploaded_path, _file, options = storage.uploads[0]
        assert bucket == "mdd"
        assert uploaded_path == path
        assert options["content-type"] == "application/pdf"
        assert options["upsert"] == "true"

    def test_signing_asks_for_the_configured_lifetime(self):
        storage = FakeStorage()
        repo = FundRepository(FakeClient(storage=storage))
        url = repo.signed_mdd_url("ZAE000027108/2026-07-31.pdf")
        assert url == "https://example.invalid/signed.pdf"
        assert storage.signed == [("mdd", "ZAE000027108/2026-07-31.pdf", 3600)]

    def test_no_stored_copy_means_no_storage_call(self):
        storage = FakeStorage()
        repo = FundRepository(FakeClient(storage=storage))
        assert repo.signed_mdd_url(None) is None
        assert storage.signed == []

    def test_a_storage_failure_costs_the_fallback_not_the_page(self):
        # The page links to the manager's own URL first; ours is the fallback
        # for when that link rots, so failing to sign one is not fatal.
        repo = FundRepository(FakeClient(storage=FakeStorage(raises=True)))
        assert repo.signed_mdd_url("a/b.pdf") is None


# ═════════════════════════════════════════════════════════════════════════════
# UserGoalsRepository
# ═════════════════════════════════════════════════════════════════════════════

class TestProfileReading:
    def test_it_reads_only_the_two_fields_it_needs(self):
        # Not `select("*")`: a match may use the risk label and the goal answers
        # and nothing else about a person.
        client = FakeClient(rows={"user_analysis": [{"risk_tolerance": "Moderate", "survey_answers": {}}]})
        UserGoalsRepository(client).profile("u-1")
        selects = [args[0] for name, args, _kw in client.calls_on("user_analysis") if name == "select"]
        assert selects == ["risk_tolerance,survey_answers"]

    @pytest.mark.parametrize(
        "stored,expected",
        [
            ("Conservative", "Conservative"),
            ("conservative", "Conservative"),
            ("aggresive", "Aggressive"),  # the typo that exists in live data
            ("low", "Conservative"),
            ("high", "Aggressive"),
            (None, "Moderate"),
            ("nonsense", "Moderate"),
        ],
    )
    def test_the_risk_label_is_normalised_on_read(self, stored, expected):
        client = FakeClient(rows={"user_analysis": [{"risk_tolerance": stored, "survey_answers": {}}]})
        profile = UserGoalsRepository(client).profile("u-1")
        assert profile is not None
        assert profile.risk_tolerance == expected

    def test_goals_are_parsed_from_the_survey_answers(self):
        client = FakeClient(
            rows={
                "user_analysis": [
                    {
                        "risk_tolerance": "Moderate",
                        "survey_answers": {
                            "q_risk_1": "b",
                            "goals": {
                                "horizon_target_year": 2031,
                                "horizon_band": "5_plus",
                                "purpose": "growth",
                                "account_type": "tfsa",
                                "contribution_style": "monthly",
                                "answered_at": "2026-09-04T10:00:00Z",
                            },
                        },
                    }
                ]
            }
        )
        profile = UserGoalsRepository(client).profile("u-1")
        assert profile is not None
        assert profile.goals is not None
        assert profile.goals.purpose == "growth"
        assert profile.goals.horizon_target_year == 2031
        assert profile.fallback_risk_only is False

    def test_a_survey_answers_json_string_is_still_read(self):
        # That column is already read both ways elsewhere in the codebase.
        client = FakeClient(
            rows={
                "user_analysis": [
                    {
                        "risk_tolerance": "Conservative",
                        "survey_answers": '{"goals": {"purpose": "emergency_fund"}}',
                    }
                ]
            }
        )
        profile = UserGoalsRepository(client).profile("u-1")
        assert profile is not None and profile.goals is not None
        assert profile.goals.purpose == "emergency_fund"

    @pytest.mark.parametrize(
        "survey_answers",
        [{}, None, "not json", {"goals": None}, {"goals": "nope"}, {"goals": {}}, {"goals": {"purpose": "yolo"}}],
    )
    def test_missing_or_unusable_goals_fall_back_to_risk_only(self, survey_answers):
        client = FakeClient(
            rows={"user_analysis": [{"risk_tolerance": "Moderate", "survey_answers": survey_answers}]}
        )
        profile = UserGoalsRepository(client).profile("u-1")
        assert profile is not None
        assert profile.goals is None
        assert profile.fallback_risk_only is True

    def test_no_record_at_all_is_none_not_a_default_profile(self):
        # An admin who never onboarded has no profile. Inventing a moderate one
        # would show them matches based on answers they never gave.
        client = FakeClient(rows={"user_analysis": []})
        assert UserGoalsRepository(client).profile("u-1") is None

    def test_a_database_failure_degrades_to_none(self):
        assert UserGoalsRepository(FakeClient(raises=True)).profile("u-1") is None


# ═════════════════════════════════════════════════════════════════════════════
# Validators
# ═════════════════════════════════════════════════════════════════════════════

class TestNumberReading:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            (1.26, 1.26),
            (3, 3.0),
            ("1.26", 1.26),
            ("1.26%", 1.26),
            (" 1.26 % ", 1.26),
            ("1,005.5", 1005.5),
            ("", None),
            ("  ", None),
            (None, None),
            ("n/a", None),
            (True, None),
            (False, None),
        ],
    )
    def test_figures_copied_off_a_pdf_are_read(self, raw, expected):
        assert as_number(raw) == expected


class TestIsin:
    def test_a_real_shape_passes(self):
        assert IsinValidator().check({"isin": "ZAE000027108"}) == []

    @pytest.mark.parametrize(
        "isin",
        ["", None, "ZAE00002710", "ZAE0000271088", "12E000027108", "ZAE00002710X", "ZAE-00027108"],
    )
    def test_a_wrong_shape_is_reported(self, isin):
        assert IsinValidator().check({"isin": isin})


class TestVehicleConsistency:
    def test_a_listed_etf_needs_its_listing_details(self):
        assert VehicleConsistencyValidator().check(FUND_ROW) == []

    def test_an_etf_without_a_code_or_symbol_is_reported(self):
        problems = VehicleConsistencyValidator().check(dict(FUND_ROW, jse_code=None, yahoo_symbol=None))
        assert {p.field for p in problems} == {"jse_code", "yahoo_symbol"}

    def test_an_etf_symbol_must_be_a_jse_symbol(self):
        # A '.JO' suffix is what makes the price rand cents. Any other suffix is
        # a different market, and often a different instrument entirely.
        problems = VehicleConsistencyValidator().check(dict(FUND_ROW, yahoo_symbol="EXM40"))
        assert [p.field for p in problems] == ["yahoo_symbol"]

    def test_a_unit_trust_must_not_claim_a_price_feed(self):
        # The mistake this catches: a fund house that runs both an ETF and its
        # unit-trust twin, transcribed from the wrong sheet. A price symbol on a
        # unit trust is almost always a different instrument — typically an
        # offshore share class quoted in dollars.
        row = dict(FUND_ROW, vehicle="unit_trust")
        problems = VehicleConsistencyValidator().check(row)
        assert {p.field for p in problems} == {"yahoo_symbol"}

    def test_a_unit_trust_may_carry_a_jse_code(self):
        # REGRESSION GUARD against this validator's first draft, which required
        # `etf` if and only if a code was present. Real fact sheets disproved it:
        # FundRock prints "JSE Code: BBBCF" on a unit trust, where the code
        # identifies the fund for dealing rather than a listing. The stricter
        # rule would have rejected a large part of the catalogue for looking
        # wrong.
        row = dict(FUND_ROW, vehicle="unit_trust", jse_code="BBBCF", yahoo_symbol=None)
        assert VehicleConsistencyValidator().check(row) == []

    def test_a_clean_unit_trust_passes(self):
        row = dict(FUND_ROW, vehicle="unit_trust", jse_code=None, yahoo_symbol=None, is_index_tracker=False)
        assert VehicleConsistencyValidator().check(row) == []

    def test_an_unknown_vehicle_is_reported(self):
        assert VehicleConsistencyValidator().check(dict(FUND_ROW, vehicle="bond"))


class TestAsisaCategory:
    def test_a_covered_category_with_matching_tiers_passes(self):
        assert AsisaCategoryValidator().check(FUND_ROW) == []

    def test_an_uncovered_category_is_reported_with_what_to_do(self):
        problems = AsisaCategoryValidator().check(dict(FUND_ROW, asisa_category="South African - Equity - Mining"))
        assert len(problems) == 1
        assert "asisa.py" in problems[0].message

    def test_denormalised_tiers_must_agree_with_the_category(self):
        problems = AsisaCategoryValidator().check(dict(FUND_ROW, asisa_asset_class="Multi Asset"))
        assert [p.field for p in problems] == ["asisa_asset_class"]

    def test_a_missing_category_is_reported(self):
        assert AsisaCategoryValidator().check(dict(FUND_ROW, asisa_category=None))


class TestRiskLabel:
    def test_a_level_agreeing_with_its_words_passes(self):
        assert RiskLabelValidator().check({"risk_indicator_1to5": 3, "risk_indicator_raw": "Moderate"}) == []

    def test_a_level_contradicting_its_words_is_an_error(self):
        # The one that matters: the words are displayed, the number filters, so
        # a disagreement is invisible and changes who sees the fund.
        problems = RiskLabelValidator().check({"risk_indicator_1to5": 3, "risk_indicator_raw": "High"})
        assert [p.field for p in problems] == ["risk_indicator_1to5"]
        assert problems[0].severity == ERROR

    def test_an_unreadable_wording_is_a_warning_not_a_block(self):
        problems = RiskLabelValidator().check({"risk_indicator_1to5": 3, "risk_indicator_raw": "spicy"})
        assert [p.severity for p in problems] == [WARNING]

    def test_an_absent_level_is_fine(self):
        # A manager who publishes no indicator is normal, and the fund simply
        # never matches.
        assert RiskLabelValidator().check({"risk_indicator_1to5": None}) == []

    @pytest.mark.parametrize("level", [0, 6, -1, "high"])
    def test_a_level_off_the_scale_is_reported(self, level):
        assert RiskLabelValidator().check({"risk_indicator_1to5": level})

    def test_a_fractional_level_is_reported(self):
        assert RiskLabelValidator().check({"risk_indicator_1to5": 2.5, "risk_indicator_raw": ""})


class TestFees:
    def test_published_figures_that_add_up_pass(self):
        assert FeeRelationValidator().check({"ter": 1.26, "tc": 0.09, "tic": 1.35}) == []

    def test_a_charge_below_the_expense_ratio_is_an_error(self):
        # Managers print these adjacent and per fee class, so reading two off
        # the wrong rows is the likeliest fee mistake there is.
        problems = FeeRelationValidator().check({"ter": 1.35, "tic": 1.26})
        assert [p.field for p in problems] == ["tic"]
        assert problems[0].severity == ERROR

    def test_a_small_disagreement_is_a_warning(self):
        problems = FeeRelationValidator().check({"ter": 1.26, "tc": 0.09, "tic": 1.50})
        assert [p.severity for p in problems] == [WARNING]

    def test_rounding_on_a_one_decimal_sheet_is_tolerated(self):
        assert FeeRelationValidator().check({"ter": 1.2, "tc": 0.1, "tic": 1.33}) == []

    def test_a_misplaced_decimal_point_is_caught_by_range(self):
        # 146 instead of 1.46: renders perfectly, and would be the largest fee
        # in the country.
        chain = snapshot_validators(today=TODAY)
        problems = chain.errors(snapshot(ter=146))
        assert any(p.field == "ter" for p in problems)


class TestAllocation:
    def test_an_allocation_that_accounts_for_the_fund_passes(self):
        assert AllocationValidator().check({"asset_allocation": {"equity": 60, "bonds": 35, "cash": 5}}) == []

    def test_no_allocation_at_all_is_fine(self):
        # An index tracker's sheet often prints none; the index is the answer.
        for empty in (None, "", {}, []):
            assert AllocationValidator().check({"asset_allocation": empty}) == []

    def test_a_partial_allocation_is_reported(self):
        problems = AllocationValidator().check({"asset_allocation": {"equity": 40, "bonds": 20}})
        assert problems and "line item" in problems[0].message

    def test_rounding_is_tolerated(self):
        assert AllocationValidator().check({"asset_allocation": {"equity": 60.1, "bonds": 39.8}}) == []

    def test_a_negative_or_unreadable_slice_is_reported(self):
        assert AllocationValidator().check({"asset_allocation": {"equity": -5, "bonds": 105}})
        assert AllocationValidator().check({"asset_allocation": {"equity": "sixty"}})

    def test_the_wrong_shape_is_reported(self):
        assert AllocationValidator().check({"asset_allocation": "60% equity"})


class TestFreshness:
    def test_a_recent_sheet_passes(self):
        assert FreshnessValidator(today=TODAY).check({"as_of": "2026-07-31"}) == []

    def test_a_stale_sheet_is_a_warning_naming_the_fix(self):
        # The five-year-old platform copy found during design is exactly this.
        problems = FreshnessValidator(today=TODAY).check({"as_of": "2021-06-30"})
        assert [p.severity for p in problems] == [WARNING]
        assert "manager's own site" in problems[0].message

    def test_a_future_date_is_an_error(self):
        problems = FreshnessValidator(today=TODAY).check({"as_of": "2027-01-31"})
        assert [p.severity for p in problems] == [ERROR]

    @pytest.mark.parametrize("raw", [None, "", "31 July 2026", "2026/07/31", "July 2026"])
    def test_a_missing_or_malformed_date_is_an_error(self, raw):
        # Every figure on the page is dated by this field, so an unparseable one
        # blocks the write rather than being shown as "as at 31 July 2026".
        problems = FreshnessValidator(today=TODAY).check({"as_of": raw})
        assert problems and all(p.severity == ERROR for p in problems)

    def test_a_date_object_is_accepted(self):
        assert FreshnessValidator(today=TODAY).check({"as_of": date(2026, 7, 31)}) == []


class TestTheChains:
    def test_a_clean_fund_and_snapshot_pass_their_chains(self):
        assert fund_validators().errors(FUND_ROW) == []
        assert snapshot_validators(today=TODAY).errors(snapshot()) == []

    def test_every_problem_in_a_row_is_reported_at_once(self):
        # Reporting one problem per run would mean twenty loader runs to fix
        # twenty fields in one transcribed sheet.
        broken = dict(FUND_ROW, isin="nope", vehicle="bond", asisa_category="South African - Equity - Mining")
        fields = {p.field for p in fund_validators().check(broken)}
        assert {"isin", "vehicle", "asisa_category"} <= fields

    def test_findings_are_numbered_by_row(self):
        findings = fund_validators().check_all([FUND_ROW, dict(FUND_ROW, isin="nope")])
        assert [index for index, _problem in findings] == [2]

    def test_warnings_do_not_block_a_write(self):
        stale = snapshot(as_of="2021-06-30")
        chain = snapshot_validators(today=TODAY)
        assert chain.check(stale)          # something was said
        assert chain.errors(stale) == []   # but nothing blocking
        assert chain.is_valid(stale) is True

    def test_a_range_validator_can_be_required(self):
        validator = NumericRangeValidator("ter", 0, 15, required=True)
        assert validator.check({}) == [Problem("ter", "is required")]

    def test_a_problem_reads_as_a_sentence(self):
        assert str(Problem("ter", "is required")) == "[error] ter: is required"


class TestProfileValueObject:
    def test_a_profile_without_goals_says_so(self):
        assert Profile(user_id="u-1", risk_tolerance="Moderate").fallback_risk_only is True
