# Catalogue curation

Tools for the person adding funds to `data/funds/funds.csv` and
`snapshots.csv`. **None of this runs in the app** — the API never opens a PDF.
They need `requirements-dev.txt` (`pypdf`, `pymupdf`).

The funds page claims that every figure it shows came off a document the fund
manager published. These scripts are how that claim stays checkable: they say
where each number was read from, and they print `MISSING` instead of filling a
gap.

## The rules they exist to enforce

1. **Manager origin only.** Fetch the fact sheet from the ManCo that issues it,
   never a platform's copy. Mirrors run stale — one found was five years old —
   and platform page metadata drifts from the document it links (TER 1.17% on
   the page against 1.31% on the sheet).
2. **Inside the availability boundary.** A fund nobody can buy has no business
   in the catalogue. For JSE-listed instruments this is a lookup, not a
   judgement: `easyequities_instruments.py`.
3. **Drop rather than guess.** No ISIN or no ASISA category on the sheet means
   the fund is skipped. A guessed number renders identically to a published one,
   which makes it worse than an empty catalogue.

## The scripts

| Script | What it is for |
|---|---|
| `easyequities_instruments.py` | The availability boundary. Reads the instrument workbook EasyEquities publishes; look an ISIN up before seeding it. |
| `satrix_mdd.py` | Satrix fact sheets, keyed by JSE code at a stable URL. Also crops the risk block to an image. |
| `fundrock_mdd.py` | FundRock/BCI fact sheets — one template across ~580 fund classes from many boutique managers. `--index` lists them. |

Downloads land in `.cache/`, which is gitignored.

## Two traps worth knowing before you transcribe anything

**The risk profile is usually a graphic.** Managers draw a scale and fill in the
step that applies. The text layer often contains *all* the step labels whatever
the rating, so matching it returns nothing or the wrong answer. Render the block
and read it. This is not hypothetical: the Satrix 40 ETF was seeded as
publishing no rating when its sheet says AGGRESSIVE, and the mistake was
repeated in the design note before anyone looked at the picture.

**A house may word its scale by temperament rather than by risk.** Satrix runs
CONSERVATIVE / CAUTIOUS / MODERATE / MODERATE-AGGRESSIVE / AGGRESSIVE, where
"conservative" is the *lowest* step — the opposite end from what the same word
means as a user's own risk tolerance. `src/funds/risk_scale.py` maps the
wordings; add to it rather than normalising by hand, and add a case to
`tests/test_funds_risk_scale.py` when you do.

## After editing the CSVs

```bash
./venv/bin/python scripts/load_fund_seed.py . --dry-run   # validates, writes nothing
./venv/bin/python -m pytest tests/test_fund_seed_loader.py
```

The loader validates every row before writing any of them, and the test file
runs each seeded fund through the real matcher to check it lands where its own
sheet implies — including that all three risk profiles still match something.
