"""The funds catalogue: South African unit trusts and JSE-listed ETFs.

A catalogue and a deterministic lookup, NOT a pipeline. Funds are read from the
fact sheets their management companies are obliged to publish (Minimum Disclosure
Documents), stored as append-only monthly snapshots, and matched to a user's
onboarding profile by a rule chain over labels the fund house already publishes.

Nothing in here participates in the nightly quant/sentiment run, and that is
deliberate rather than incidental: a fund has no StockTwits stream, so the
sentiment phase would score it a neutral 50, which convergence reads as
quant-vs-sentiment *conflict* and actively penalises. A Top-40 tracker ranked
cross-sectionally against Nvidia is meaningless anyway. ``test_funds_isolation``
fails if the pipeline ever imports this package.

Design note (rationale, evidence, the decision trail and the open questions):
``03-reference/design/2026-09-03-funds-etf-unit-trust-section.md`` in the project
vault. Feature-flagged off by default — see ``config.py``.
"""
