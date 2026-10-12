"""Find which Gemini models this project can call, and from which locations.

    venv/bin/python scripts/probe_gemini.py

Sends a two-word prompt to each model in each location and prints a table. Every
call is a handful of tokens, so the whole run costs well under a cent. Reads the
project from backend/.env (GOOGLE_CLOUD_PROJECT).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND / ".env")

project = os.getenv("GOOGLE_CLOUD_PROJECT")
if not project:
    sys.exit("GOOGLE_CLOUD_PROJECT is not set in backend/.env")

from google import genai  # noqa: E402
from google.genai import errors  # noqa: E402

MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
LOCATIONS = ["europe-west1", "europe-west4", "eu", "global", "us-central1"]

print(f"project {project}\n")
print(f"{'model':<24}" + "".join(f"{loc:<15}" for loc in LOCATIONS))

for model in MODELS:
    row = f"{model:<24}"
    for location in LOCATIONS:
        try:
            client = genai.Client(vertexai=True, project=project, location=location)
            client.models.generate_content(model=model, contents="Reply OK")
            cell = "OK"
        except errors.APIError as e:
            cell = f"{e.code}"
        except Exception as e:  # a location the SDK cannot reach at all
            cell = type(e).__name__[:12]
        row += f"{cell:<15}"
    print(row, flush=True)

print("\nOK = works. 404 = not available there. 403 = no access. 429 = quota.")
