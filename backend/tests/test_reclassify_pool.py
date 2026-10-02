"""The seed half of scripts/reclassify_pool.py: which curated corrections still need doing."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

_spec = importlib.util.spec_from_file_location(
    "reclassify_pool", BACKEND_ROOT / "scripts" / "reclassify_pool.py"
)
rp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(rp)

from src.agents.asset_discovery import UNIVERSES  # noqa: E402

SeedCorrection = rp.SeedCorrection
SeedCorrectionPlan = rp.SeedCorrectionPlan


def seed(ticker, universe="Technology", is_active=True):
    return {"ticker": ticker, "universe": universe, "origin": "seed", "is_active": is_active}


class TestSeedCorrectionPlan:
    def test_a_seed_in_the_wrong_universe_is_pending(self):
        plan = SeedCorrectionPlan([SeedCorrection("NVDA", universe="AI & Robotics")], [seed("NVDA")])
        assert [c.ticker for c in plan.pending] == ["NVDA"]

    def test_a_correction_already_made_is_not_pending(self):
        # So the script is safe to run twice.
        rows = [seed("NVDA", universe="AI & Robotics"), seed("ARKQ", is_active=False)]
        corrections = [
            SeedCorrection("NVDA", universe="AI & Robotics"),
            SeedCorrection("ARKQ", deactivate=True),
        ]
        assert SeedCorrectionPlan(corrections, rows).pending == []

    def test_an_active_seed_to_switch_off_is_pending(self):
        plan = SeedCorrectionPlan([SeedCorrection("ARKQ", deactivate=True)], [seed("ARKQ")])
        assert [c.ticker for c in plan.pending] == ["ARKQ"]

    def test_a_discovered_row_is_never_treated_as_a_seed(self):
        row = {"ticker": "NVDA", "universe": "Technology", "origin": "discovered"}
        plan = SeedCorrectionPlan([SeedCorrection("NVDA", universe="AI & Robotics")], [row])
        assert plan.pending == [] and plan.missing == ["NVDA"]

    def test_a_correction_for_a_ticker_not_in_the_pool_is_reported(self):
        plan = SeedCorrectionPlan([SeedCorrection("ZZZZ", universe="Finance")], [])
        assert plan.missing == ["ZZZZ"]


class TestTheDecidedCorrections:
    def test_every_target_universe_is_real(self):
        for c in rp.SEED_CORRECTIONS:
            assert c.universe is None or c.universe in UNIVERSES

    def test_each_correction_does_exactly_one_thing(self):
        for c in rp.SEED_CORRECTIONS:
            assert (c.universe is not None) != c.deactivate, c.ticker

    def test_each_correction_says_why(self):
        assert all(c.why for c in rp.SEED_CORRECTIONS)
