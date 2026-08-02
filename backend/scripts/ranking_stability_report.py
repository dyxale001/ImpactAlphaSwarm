"""Night-over-night stability report for unified ranking v2 (WP5).

Answers: does the v2 ordering CHURN between nights? A feed that reshuffles nightly
is as untrustworthy as a misleading score. Compares a saved snapshot of a previous
night against the current `ranking_shadow` contents, and benchmarks v2 churn against
the LEGACY score's own churn — the fair comparison, since some movement is real.

Since migration 011 the table retains a row per night, so both nights are read
straight from it — no snapshot needed. A JSON snapshot may still be passed as the
second argument to compare against a night recorded before that migration.

Usage:  venv/bin/python scripts/ranking_stability_report.py backend [night1.json]
"""
import json
import os
import statistics as st
import sys
from collections import Counter

BACKEND = sys.argv[1]
N1 = sys.argv[2] if len(sys.argv) > 2 else None
sys.path.insert(0, BACKEND)
from dotenv import load_dotenv

load_dotenv(os.path.join(BACKEND, ".env"))
from src.utils.supabase_client import supabase  # noqa: E402

_all = supabase.table("ranking_shadow").select("*").execute().data or []
_nights = sorted({r.get("as_of_night") for r in _all if r.get("as_of_night")})

if N1:
    night1 = json.load(open(N1))
    night2 = [r for r in _all if r.get("as_of_night") == _nights[-1]] if _nights else _all
    print(f"comparing snapshot {N1} -> night {_nights[-1] if _nights else '(all)'}")
elif len(_nights) >= 2:
    night1 = [r for r in _all if r.get("as_of_night") == _nights[-2]]
    night2 = [r for r in _all if r.get("as_of_night") == _nights[-1]]
    print(f"comparing night {_nights[-2]} -> night {_nights[-1]}")
else:
    print(f"Need two nights of ranking_shadow data; found {len(_nights)} "
          f"({', '.join(str(n) for n in _nights) or 'none'}).")
    print("Run another shadow night, or pass a pre-migration-011 JSON snapshot.")
    sys.exit(0)
print(f"night 1: {len(night1)} rows    night 2: {len(night2)} rows\n")


def index(rows):
    by_run = {}
    for r in rows:
        by_run.setdefault(r["run_id"], {})[r["ticker"]] = r
    return by_run


a, b = index(night1), index(night2)
shared_runs = sorted(set(a) & set(b))
print(f"runs present both nights: {len(shared_runs)}\n")

print("=" * 74)
print("TOP-5 STABILITY (v2 order, night 1 -> night 2)")
print("=" * 74)
tot = changed = 0
overlaps = []
for run in shared_runs:
    t1 = [t for t, r in sorted(a[run].items(), key=lambda kv: kv[1].get("v2_rank") or 999)][:5]
    t2 = [t for t, r in sorted(b[run].items(), key=lambda kv: kv[1].get("v2_rank") or 999)][:5]
    d = sum(1 for i in range(min(len(t1), len(t2))) if t1[i] != t2[i])
    ov = len(set(t1) & set(t2))
    overlaps.append(ov)
    tot += 5
    changed += d
    flag = "" if d == 0 else ("  <- churn" if d >= 4 else "")
    print(f"  {run[:8]}  n1 {t1}")
    print(f"  {'':10}n2 {t2}   [{d}/5 positions moved, {ov}/5 same names]{flag}")
print(f"\n  positions moved night-over-night: {changed}/{tot} ({100*changed/tot:.0f}%)")
print(f"  mean name overlap in the top 5: {st.mean(overlaps):.1f}/5")

print("\n" + "=" * 74)
print("COMPARISON: v2 churn vs LEGACY churn (is v2 worse than what ships today?)")
print("=" * 74)
ltot = lchanged = 0
loverlaps = []
for run in shared_runs:
    l1 = [t for t, r in sorted(a[run].items(), key=lambda kv: kv[1].get("legacy_rank") or 999)][:5]
    l2 = [t for t, r in sorted(b[run].items(), key=lambda kv: kv[1].get("legacy_rank") or 999)][:5]
    lchanged += sum(1 for i in range(min(len(l1), len(l2))) if l1[i] != l2[i])
    loverlaps.append(len(set(l1) & set(l2)))
    ltot += 5
print(f"  LEGACY positions moved: {lchanged}/{ltot} ({100*lchanged/ltot:.0f}%)"
      f"   mean overlap {st.mean(loverlaps):.1f}/5")
print(f"  V2     positions moved: {changed}/{tot} ({100*changed/tot:.0f}%)"
      f"   mean overlap {st.mean(overlaps):.1f}/5")
verdict = ("v2 is MORE stable than legacy" if changed < lchanged
           else "v2 is LESS stable than legacy" if changed > lchanged else "comparable")
print(f"  >>> {verdict}")

print("\n" + "=" * 74)
print("TERM STABILITY (same ticker, both nights)")
print("=" * 74)
for term in ("rank_score", "signal_strength", "convergence", "data_sufficiency", "profile_fit"):
    deltas = []
    for run in shared_runs:
        for tk, r1 in a[run].items():
            r2 = b[run].get(tk)
            if r2 and r1.get(term) is not None and r2.get(term) is not None:
                deltas.append(abs(r1[term] - r2[term]))
    if deltas:
        print(f"  {term:18} mean |Δ| {st.mean(deltas):.4f}   max |Δ| {max(deltas):.4f}   n={len(deltas)}")

print("\n" + "=" * 74)
print("SIGNAL CHANGES")
print("=" * 74)
flips = []
for run in shared_runs:
    for tk, r1 in a[run].items():
        r2 = b[run].get(tk)
        if r2 and r1.get("signal_direction") != r2.get("signal_direction"):
            flips.append((tk, r1.get("signal_direction"), r2.get("signal_direction")))
print(f"  direction flips: {len(flips)}")
for tk, d1, d2 in flips[:8]:
    print(f"    {tk:8} {d1} -> {d2}")
print(f"\n  convergence states night 1: {dict(Counter(r.get('convergence_state') for r in night1))}")
print(f"  convergence states night 2: {dict(Counter(r.get('convergence_state') for r in night2))}")
u1 = sum(1 for r in night1 if r.get("signal_direction") == "unfavourable")
u2 = sum(1 for r in night2 if r.get("signal_direction") == "unfavourable")
print(f"  unfavourable share: night 1 {u1}/{len(night1)} ({100*u1/len(night1):.0f}%)"
      f"  ->  night 2 {u2}/{len(night2)} ({100*u2/len(night2):.0f}%)")
