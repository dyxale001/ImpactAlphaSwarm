"""Move names already in the discovery pool into the universe they now belong in.

    python scripts/reclassify_pool.py                            # dry run, writes nothing
    python scripts/reclassify_pool.py --apply                    # move discovered rows
    python scripts/reclassify_pool.py --include-seeds            # dry run, seeds too
    python scripts/reclassify_pool.py --include-seeds --apply    # move both

The nightly discovery pass only re-routes a ticker when it trends again, so the
AI & Robotics pins and the Technology split would take weeks to reach the names
already sitting in Technology. This runs both over the stored pool once.

Discovered rows are moved by the same rules the nightly pass uses. Curated seeds
are a different matter: nothing automated may change them, so a seed only changes
through SEED_CORRECTIONS below, a list a person wrote, and only with
--include-seeds. Without that flag the seeds the rules would move are listed as
"held" and left alone.

Exit codes: 0 done (or dry run), 2 a database error while applying.
"""

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / ".env")

from src.agents.asset_discovery import UNIVERSES, PoolReclassifier  # noqa: E402
from src.utils.supabase_client import (  # noqa: E402
    correct_seed,
    get_discovery_classification_rows,
)


@dataclass(frozen=True)
class SeedCorrection:
    """One decided change to a curated row: a new universe, or taking it out."""
    ticker: str
    universe: Optional[str] = None
    deactivate: bool = False
    why: str = ""


# Decided 2026-10-02 (fixes/universes-iteration4). Applied only with --include-seeds.
SEED_CORRECTIONS = [
    SeedCorrection("NVDA", universe="AI & Robotics", why="AI chips; onboarding already says so"),
    SeedCorrection("TSLA", universe="AI & Robotics", why="FSD and robotics; onboarding already says so"),
    SeedCorrection("AMD", universe="AI & Robotics", why="AI accelerators"),
    SeedCorrection("AVGO", universe="AI & Robotics", why="custom AI chips and AI networking"),
    SeedCorrection("CRSP", universe="Healthcare", why="gene editing, not AI"),
    SeedCorrection("UPST", universe="Finance", why="consumer lending"),
    SeedCorrection("ARKQ", deactivate=True, why="an ETF; the pool is single stocks"),
    SeedCorrection("BOTZ", deactivate=True, why="an ETF; the pool is single stocks"),
    SeedCorrection("ROBO", deactivate=True, why="an ETF; the pool is single stocks"),
]


class SeedCorrectionPlan:
    """The corrections that still need doing, given the rows as they stand."""

    def __init__(self, corrections: list[SeedCorrection], rows: list[dict]):
        seeds = {r["ticker"]: r for r in rows if r.get("origin") == "seed" and r.get("ticker")}
        self.pending: list[SeedCorrection] = []
        self.missing: list[str] = []
        for c in corrections:
            row = seeds.get(c.ticker)
            if row is None:
                self.missing.append(c.ticker)
                continue
            moves = c.universe is not None and c.universe != row.get("universe")
            switches_off = c.deactivate and row.get("is_active") is not False
            if moves or switches_off:
                self.pending.append(c)

    def describe(self, rows: list[dict]) -> list[str]:
        where = {r["ticker"]: r.get("universe") for r in rows if r.get("ticker")}
        lines = []
        for c in self.pending:
            action = "switch off" if c.deactivate else f"{where.get(c.ticker)} -> {c.universe}"
            lines.append(f"  {c.ticker:<6} {action}  ({c.why})")
        return lines


class ReclassifyCommand:
    """Reads the pool, plans the moves, prints them, and applies them on request."""

    def __init__(self, reclassifier: PoolReclassifier | None = None,
                 corrections: list[SeedCorrection] | None = None):
        self.reclassifier = reclassifier or PoolReclassifier()
        self.corrections = corrections if corrections is not None else SEED_CORRECTIONS

    def run(self, apply: bool, include_seeds: bool) -> int:
        rows = get_discovery_classification_rows(UNIVERSES)
        if not rows:
            print("No pool rows read; nothing to do (check SUPABASE_* in .env).")
            return 0
        self.print_counts("Pool before", rows)

        plan = self.reclassifier.plan(rows)
        seed_plan = SeedCorrectionPlan(self.corrections, rows) if include_seeds else None
        self.report(plan, seed_plan, rows)

        nothing = not plan.moves and not (seed_plan and seed_plan.pending)
        if nothing:
            print("\nNothing to change.")
            return 0
        if not apply:
            print("\nDry run: nothing written. Rerun with --apply to make these changes.")
            return 0
        try:
            self.reclassifier.apply(plan)
            for c in seed_plan.pending if seed_plan else []:
                correct_seed(c.ticker, universe=c.universe, is_active=False if c.deactivate else None)
        except Exception as exc:
            print(f"\nFailed while applying: {exc}")
            return 2
        self.print_counts("\nPool after", get_discovery_classification_rows(UNIVERSES))
        return 0

    @staticmethod
    def print_counts(label: str, rows: list[dict]) -> None:
        active = [r for r in rows if r.get("is_active") is not False]
        counts = {u: sum(1 for r in active if r.get("universe") == u) for u in UNIVERSES}
        print(f"{label} (active rows):", ", ".join(f"{u} {n}" for u, n in counts.items()))

    @staticmethod
    def report(plan, seed_plan, rows) -> None:
        print(f"\nDiscovered rows to move ({len(plan.moves)}):")
        for ticker, (old, new) in sorted(plan.moves.items()):
            print(f"  {ticker:<6} {old} -> {new}")
        if seed_plan is not None:
            print(f"\nSeed corrections to make ({len(seed_plan.pending)}):")
            for line in seed_plan.describe(rows):
                print(line)
            if seed_plan.missing:
                print(f"  not in the pool, skipped: {', '.join(seed_plan.missing)}")
        elif plan.seeds_held:
            print(f"\nSeeds the rules would move, left alone without --include-seeds "
                  f"({len(plan.seeds_held)}):")
            for ticker, (old, new) in sorted(plan.seeds_held.items()):
                print(f"  {ticker:<6} {old} -> {new}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes")
    parser.add_argument("--include-seeds", action="store_true",
                        help="also apply SEED_CORRECTIONS to curated rows")
    args = parser.parse_args()
    return ReclassifyCommand().run(apply=args.apply, include_seeds=args.include_seeds)


if __name__ == "__main__":
    sys.exit(main())
