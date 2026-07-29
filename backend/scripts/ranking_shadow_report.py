"""Shadow report for unified ranking v2 (UNIFIED_SCORING_PLAN.md WP5).

Reads `ranking_shadow` — the FULL candidate set per run, not just the persisted
top 5 — and answers the open design questions from real data: how many candidates
lean unfavourable and where each direction treatment would rank them (R1), whether
the convergence term fires (R3), whether the composite uses more than one term
(R2), and the quant-state mix (R6). Read-only.

Usage:  venv/bin/python scripts/ranking_shadow_report.py backend [YYYY-MM-DD]
"""
import os
import statistics as st
import sys
from collections import Counter, defaultdict

BACKEND = sys.argv[1]
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND, ".env"))
from src.utils.supabase_client import supabase  # noqa: E402

rows = supabase.table("ranking_shadow").select("*").execute().data or []

# ranking_shadow now retains multiple nights (migration 011). Report on ONE night —
# the most recent by default, or the date given as the second argument — otherwise
# candidates would appear once per night and every count would be inflated.
nights = sorted({r.get("as_of_night") for r in rows if r.get("as_of_night")})
want = sys.argv[2] if len(sys.argv) > 2 else (nights[-1] if nights else None)
if want:
    rows = [r for r in rows if r.get("as_of_night") == want]
    print(f"night: {want}" + (f"   (available: {', '.join(str(n) for n in nights)})" if len(nights) > 1 else ""))
print(f"ranking_shadow rows: {len(rows)}")
if not rows:
    print("NO ROWS — shadow logging did not write. Check the backend log.")
    sys.exit(1)

by_run = defaultdict(list)
for r in rows:
    by_run[r["run_id"]].append(r)
print(f"runs: {len(by_run)}   candidates per run: {sorted(len(v) for v in by_run.values())}")
print(f"(compare: ai_recommendation only ever holds 5 per run)\n")

print("=" * 76)
print("R1 — DIRECTION: are there unfavourable candidates, and where do they rank?")
print("=" * 76)
unfav = [r for r in rows if r.get("signal_direction") == "unfavourable"]
print(f"  unfavourable candidates: {len(unfav)}/{len(rows)}  ({100*len(unfav)/len(rows):.0f}%)")
print(f"  direction mix: {dict(Counter(r.get('signal_direction') for r in rows))}")
if unfav:
    print("\n  where they rank under each candidate treatment (top 8 by |lean|):")
    print(f"    {'ticker':8}{'combined':>9}{'shift':>8}{'clip':>8}{'abs':>8}   v2_rank/of")
    for r in sorted(unfav, key=lambda x: x.get("combined_lean") or 0)[:8]:
        sv = r.get("strength_variants") or {}
        n = len(by_run[r["run_id"]])
        print(f"    {r['ticker']:8}{r.get('combined_lean') or 0:>+9.3f}"
              f"{sv.get('shift', 0):>8.3f}{sv.get('clip', 0):>8.3f}{sv.get('abs', 0):>8.3f}"
              f"   {r.get('v2_rank')}/{n}")
    worst = min(unfav, key=lambda x: x.get("combined_lean") or 0)
    sv = worst.get("strength_variants") or {}
    print(f"\n  MOST bearish candidate: {worst['ticker']} (combined {worst.get('combined_lean'):+.3f})")
    print(f"    under 'abs'   it would score {sv.get('abs', 0):.3f}  <-- ranks it as if favourable")
    print(f"    under 'shift' it would score {sv.get('shift', 0):.3f}")
    print(f"    under 'clip'  it would score {sv.get('clip', 0):.3f}")
    # would abs promote it into a top 5?
    promoted = 0
    for run_id, rs in by_run.items():
        order_abs = sorted(rs, key=lambda x: -((x.get("strength_variants") or {}).get("abs") or 0))[:5]
        promoted += sum(1 for x in order_abs if x.get("signal_direction") == "unfavourable")
    print(f"\n  >>> under 'abs', unfavourable assets would occupy {promoted} top-5 slots across {len(by_run)} runs")

print("\n" + "=" * 76)
print("R3 — CONVERGENCE: does the hype-check replacement actually fire?")
print("=" * 76)
states = Counter(r.get("convergence_state") for r in rows)
for s in ("agree_strongly", "lean_together", "mixed", "conflict"):
    print(f"  {s:16} {states.get(s, 0):4}")
fired = states.get("conflict", 0) + states.get("mixed", 0)
print(f"\n  >>> fired (mixed or conflict): {fired}/{len(rows)} rows"
      f"   (was 0/75 in the top-5-only sample)")
conf = [r for r in rows if r.get("convergence_state") in ("conflict", "mixed")]
if conf:
    print("\n  examples — the meme-stock profile the -25 penalty used to catch:")
    for r in sorted(conf, key=lambda x: x.get("convergence") or 1)[:6]:
        print(f"    {r['ticker']:8} quant_lean {r.get('quant_lean') or 0:+.3f}  "
              f"sent_lean {r.get('sent_lean') or 0:+.3f}  conv {r.get('convergence'):.3f}  "
              f"{r.get('convergence_state')}   legacy_rank {r.get('legacy_rank')} -> v2 {r.get('v2_rank')}")

print("\n" + "=" * 76)
print("R2 — TERM DOMINANCE on full candidate sets")
print("=" * 76)
same = 0
for run_id, rs in by_run.items():
    a = [r["ticker"] for r in sorted(rs, key=lambda x: (-(x.get("rank_score") or 0), x["ticker"]))]
    b = [r["ticker"] for r in sorted(rs, key=lambda x: (-(x.get("signal_strength") or 0), x["ticker"]))]
    same += (a == b)
print(f"  runs where rank_score order == signal_strength order: {same}/{len(by_run)}")
for term in ("signal_strength", "convergence", "data_sufficiency", "profile_fit"):
    vals = [r.get(term) for r in rows if r.get(term) is not None]
    if vals:
        print(f"  {term:18} min {min(vals):.3f}  median {st.median(vals):.3f}  max {max(vals):.3f}"
              f"  spread {max(vals)-min(vals):.3f}")

print("\n" + "=" * 76)
print("R6 — QUANT STATES across the full sets")
print("=" * 76)
print(f"  {dict(Counter(r.get('quant_state') for r in rows))}")

print("\n" + "=" * 76)
print("DIVERGENCE: legacy vs v2 on the top 5 (what users would actually see)")
print("=" * 76)
tot = ch = 0
for run_id, rs in by_run.items():
    legacy = [r["ticker"] for r in sorted(rs, key=lambda x: (x.get("legacy_rank") or 999))][:5]
    v2 = [r["ticker"] for r in sorted(rs, key=lambda x: (x.get("v2_rank") or 999))][:5]
    tot += 5
    d = sum(1 for i in range(min(len(legacy), len(v2))) if legacy[i] != v2[i])
    ch += d
    risk = rs[0].get("risk_tolerance")
    print(f"  {run_id[:8]} ({risk:12}) legacy {legacy}")
    print(f"  {'':>27} v2     {v2}   [{d}/5 changed]")
print(f"\n  total top-5 positions that would change: {ch}/{tot} ({100*ch/tot:.0f}%)")
