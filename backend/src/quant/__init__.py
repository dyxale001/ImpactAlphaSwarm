"""The Quant tab's read side: historical price windows and the paragraph written over them.

Nothing in here runs inside an analysis run. The nightly quant phase measures a ticker and
persists scalars; this package answers the asset page's questions afterwards, from public
price history it fetches on demand and from the facts the run already stored.
"""
