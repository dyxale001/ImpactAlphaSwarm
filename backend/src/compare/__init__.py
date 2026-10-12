"""The Compare page's written comparison: one paragraph saying what separates two or three
stocks, and why the reader's own run placed them where it did.

Everything the page lines up already has an endpoint (the quant window, the sentiment
history, the user's own run), so the frontend reads those directly and this package adds
only the paragraph over them, personal to the reader and written when they ask. It is
built from the Quant tab's own pieces: the window service, the run's stored measurements
and the guard, so a comparison can never quote a figure the single-stock view would not.
"""
