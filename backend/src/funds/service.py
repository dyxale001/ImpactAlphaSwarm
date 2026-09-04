"""The one entry point the funds routes call.

A facade over the repositories, the matcher and the explanation builder. It
exists so the route handlers stay four lines each and so the whole feature can
be exercised in a test without FastAPI: everything it depends on is passed in,
including the clock, because the horizon rule reads the current year.

It also owns the shape of what goes over the wire. Serialising here rather than
in the handlers keeps one description of a fund, so the browse list, the detail
page and a match card cannot drift into three slightly different fund objects.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Callable, Optional

from .asisa import ASISA, ASISA_VERSION
from . import copy as copytext
from .explain import ExplanationBuilder, ExplanationContext, ReasonSentence
from .matcher import FundMatcher
from .models import FundCandidate, FundFilters, MatchOutcome, MatchResult, Profile
from .repository import FundRepository, UserGoalsRepository
from .risk_scale import RISK_SCALE, label_for


class FundCatalogueService:
    """Reads the catalogue, matches a profile to it, and explains the result."""

    def __init__(
        self,
        funds: Optional[FundRepository] = None,
        profiles: Optional[UserGoalsRepository] = None,
        matcher: Optional[FundMatcher] = None,
        builder: Optional[ExplanationBuilder] = None,
        reason: Optional[ReasonSentence] = None,
        clock: Callable[[], date] = date.today,
    ):
        self.funds = funds or FundRepository()
        self.profiles = profiles or UserGoalsRepository()
        self.clock = clock
        self.matcher = matcher or FundMatcher(clock=clock)
        self.builder = builder or ExplanationBuilder()
        self.reason = reason or ReasonSentence()

    # ── browse ──────────────────────────────────────────────────────────────

    def list_funds(self, filters: FundFilters | None = None) -> dict[str, Any]:
        candidates = self.funds.candidates(filters)
        return {
            "asisa_version": ASISA_VERSION,
            "count": len(candidates),
            "funds": [self._fund_summary(candidate) for candidate in candidates],
            "inclusion_rule": copytext.INCLUSION_RULE,
            "not_covered": copytext.NOT_COVERED,
            "disclaimer": copytext.CIS_DISCLAIMER,
            "not_licensed": copytext.FOOTER_NOT_LICENSED,
        }

    def meta(self) -> dict[str, Any]:
        """What the browse view needs to build its filters.

        The classification comes from code rather than the table it was seeded
        into: they are held in step by a test, and reading it here would be a
        round trip for a constant.
        """
        return {
            "asisa_version": ASISA_VERSION,
            "tree": ASISA.tree(),
            "categories": [
                {"code": c.code, "tier1": c.tier1, "tier2": c.tier2, "tier3": c.tier3, "name": c.name}
                for c in ASISA.categories
            ],
            "vehicles": [
                {"value": "unit_trust", "label": "Unit trust", "note": copytext.VEHICLE_NOTE["unit_trust"]},
                {"value": "etf", "label": "Exchange traded fund", "note": copytext.VEHICLE_NOTE["etf"]},
            ],
            "risk_scale": [{"level": level, "label": word} for level, word in RISK_SCALE.items()],
            "mancos": self.funds.mancos(),
            "header": {
                "eyebrow": copytext.HEADER_EYEBROW,
                "title": copytext.HEADER_TITLE,
                "strip": copytext.HEADER_STRIP,
            },
        }

    def fund_detail(self, fund_id: str) -> Optional[dict[str, Any]]:
        fund = self.funds.get(fund_id)
        if not fund:
            return None
        history = self.funds.snapshots(fund_id)
        snapshot = history[0] if history else None
        candidate = FundCandidate(fund=fund, snapshot=snapshot)

        detail = self._fund_summary(candidate)
        detail["snapshot"] = snapshot
        detail["snapshot_history"] = [
            {"as_of": str(row.get("as_of")), "mdd_url": row.get("mdd_url")} for row in history
        ]
        detail["mdd_url"] = (snapshot or {}).get("mdd_url") or fund.get("mdd_page_url")
        # Our archived copy is the fallback for a published link that has rotted,
        # not the primary: the manager's own document is the authority.
        detail["archived_mdd_url"] = self.funds.signed_mdd_url((snapshot or {}).get("mdd_pdf_ref"))
        detail["vehicle_note"] = copytext.VEHICLE_NOTE.get(fund.get("vehicle") or "", "")
        detail["available_on"] = (
            copytext.AVAILABLE_ON.format(platforms=_join(fund.get("platforms") or []))
            if fund.get("platforms")
            else None
        )
        detail["why_this_appears"] = (
            self.builder.build(
                ExplanationContext(fund=fund, snapshot=snapshot, today=self.clock())
            )
            if snapshot
            else None
        )
        detail["disclaimer"] = copytext.CIS_DISCLAIMER
        detail["not_licensed"] = copytext.FOOTER_NOT_LICENSED
        return detail

    # ── match ───────────────────────────────────────────────────────────────

    def matches_for(self, user_id: str) -> dict[str, Any]:
        """What this user's profile maps to, with a reason per fund.

        A user with no profile gets a 200 and an explanation, not an error and
        not an empty list. An admin who never onboarded and a user whose profile
        genuinely matches nothing look identical otherwise, and only one of them
        has something to do about it.
        """
        profile = self.profiles.profile(user_id)
        if profile is None:
            return {
                "profile_found": False,
                "bracket": None,
                "matches": [],
                "rules_applied": [],
                "fallback_risk_only": False,
                "notice": copytext.PROFILE_MISSING,
                "section_title": copytext.SECTION_MATCHED,
                "not_licensed": copytext.FOOTER_NOT_LICENSED,
            }

        outcome = self.matcher.match(profile, self.funds.candidates())
        return {
            "profile_found": True,
            "bracket": self._bracket(outcome),
            "matches": [self._match(match, profile) for match in outcome.matches],
            "rules_applied": list(outcome.rules_applied),
            "fallback_risk_only": outcome.fallback_risk_only,
            "notice": self._notice(outcome),
            "section_title": copytext.SECTION_MATCHED,
            "not_licensed": copytext.FOOTER_NOT_LICENSED,
        }

    # ── shaping ─────────────────────────────────────────────────────────────

    @staticmethod
    def _notice(outcome: MatchOutcome) -> Optional[str]:
        if outcome.fallback_risk_only:
            return copytext.RISK_ONLY_NOTICE
        if not outcome.matches:
            return copytext.EMPTY_BRACKET
        return None

    @staticmethod
    def _bracket(outcome: MatchOutcome) -> Optional[dict[str, Any]]:
        bracket = outcome.bracket
        if bracket is None:
            return None
        return {
            "risk_tolerance": bracket.risk_tolerance,
            "effective": bracket.effective,
            "ceiling": bracket.ceiling,
            "ceiling_label": label_for(bracket.ceiling),
            "categories": [
                {"code": code, "name": name}
                for code, name in (
                    (code, getattr(ASISA.by_code(code), "name", code)) for code in bracket.categories
                )
            ],
            "tracker_only": list(bracket.tracker_only),
            "horizon_years": bracket.horizon_years,
            "horizon_band": bracket.horizon_band,
            "purpose": bracket.purpose,
        }

    def _match(self, match: MatchResult, profile: Profile) -> dict[str, Any]:
        return {
            "fund_id": match.fund_id,
            "isin": match.isin,
            "name": match.name,
            "vehicle": match.vehicle,
            "fund_house": match.fund_house,
            "manco": match.manco,
            "asisa_category": match.asisa_category,
            "as_of": match.as_of,
            "mdd_url": match.mdd_url,
            "risk_level": match.risk_indicator_1to5,
            "risk_label": match.risk_indicator_raw or label_for(match.risk_indicator_1to5),
            "recommended_min_term_years": match.recommended_min_term_years,
            "ter": match.ter,
            "tic": match.tic,
            "tfsa_eligible": match.tfsa_eligible,
            "is_index_tracker": match.is_index_tracker,
            "rules_applied": list(match.rules_applied),
            "reason": self.reason.render(match, profile, today=self.clock()),
        }

    @staticmethod
    def _fund_summary(candidate: FundCandidate) -> dict[str, Any]:
        fund = candidate.fund
        snapshot = candidate.snapshot or {}
        level = candidate.risk_level
        return {
            "fund_id": fund.get("id"),
            "isin": fund.get("isin"),
            "name": fund.get("name"),
            "vehicle": fund.get("vehicle"),
            "fund_house": fund.get("fund_house"),
            "manco": fund.get("manco"),
            "is_index_tracker": bool(fund.get("is_index_tracker")),
            "jse_code": fund.get("jse_code"),
            "asisa_geography": fund.get("asisa_geography"),
            "asisa_asset_class": fund.get("asisa_asset_class"),
            "asisa_category": fund.get("asisa_category"),
            "tfsa_eligible": bool(fund.get("tfsa_eligible")),
            "platforms": fund.get("platforms") or [],
            "curation_rule": fund.get("curation_rule"),
            # Two different things, and the card must prefer the first. `mdd_url`
            # is the dated document these figures came from; `mdd_page_url` is
            # the manager's listing page the current sheet is resolved from,
            # which for a manager with no per-fund page is an index of hundreds.
            # Offering the index under "read the fact sheet" is what this
            # distinction exists to prevent.
            "mdd_url": snapshot.get("mdd_url"),
            "mdd_page_url": fund.get("mdd_page_url"),
            "as_of": str(snapshot.get("as_of")) if snapshot.get("as_of") else None,
            "risk_level": level,
            "risk_label": snapshot.get("risk_indicator_raw") or label_for(level),
            # Said out loud rather than left as a blank cell: a manager who
            # publishes no indicator is why this fund cannot be matched.
            "risk_note": None if level is not None else copytext.NO_PUBLISHED_RISK_LABEL,
            "ter": snapshot.get("ter"),
            "tic": snapshot.get("tic"),
            "recommended_min_term_years": snapshot.get("recommended_min_term_years"),
            "distribution_frequency": snapshot.get("distribution_frequency"),
            "fund_size_zar": snapshot.get("fund_size_zar"),
            "has_factsheet": bool(candidate.snapshot),
        }


def _join(items) -> str:
    parts = [str(item) for item in items if item]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return f"{', '.join(parts[:-1])} and {parts[-1]}"
