"""The Compare page's read side: one paragraph saying what separates two or three stocks.

Everything the page lines up already has an endpoint (the quant window, the sentiment
history, the user's own run), so the frontend reads those directly and this package adds
only the written comparison over them. It is built from the Quant tab's own pieces: the
window service, the run's stored measurements and the guard, so a comparison can never
quote a figure the single-stock view would not.
"""
