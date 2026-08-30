# Cloud Run image for the AlphaSwarm FastAPI backend.
# Slim base keeps the image small now that torch/transformers are gone.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source.
COPY . .

# Cloud Run injects $PORT (defaults to 8080). Bind gunicorn to it.
ENV PORT=8080
EXPOSE 8080

# Single worker keeps memory low; raise --workers if the revision has more RAM/CPU.
#
# The timeout is generous because an analysis runs as a background task after its
# response has been sent, and a run over thirty tickers takes minutes by design. At
# 120s gunicorn was SIGABRTing the worker mid-run: on one observed run the
# recommendations were written at 22:35:14 and the worker died at 22:36:40, before
# the run could be marked complete, so the page polled a status that never changed.
# Cloud Run's own request timeout is 3600s, so this is the binding limit, not that.
CMD exec gunicorn -k uvicorn.workers.UvicornWorker src.api:app \
    --bind 0.0.0.0:${PORT} --workers 1 --timeout 1800
