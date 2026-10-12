"""Check that Gemini on Vertex AI is set up: read one fact sheet and print the cost.

    venv/bin/python scripts/check_gemini.py

Reads the project, region and model from backend/.env (GOOGLE_CLOUD_PROJECT,
GOOGLE_CLOUD_LOCATION, FUND_EXTRACT_MODEL), sends the first fact sheet in
data/funds/mdd to the model, and prints its answer and the tokens it used.
One call, a fraction of a cent.
"""

from __future__ import annotations

import glob
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND / ".env")

project = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION", "eu")
model = os.getenv("FUND_EXTRACT_MODEL", "gemini-3.8-flash")
if not project:
    sys.exit("GOOGLE_CLOUD_PROJECT is not set in backend/.env")

sheets = sorted(glob.glob(str(BACKEND / "data/funds/mdd/**/*.pdf"), recursive=True))
if not sheets:
    sys.exit("No PDF found under backend/data/funds/mdd")

from google import genai  # noqa: E402
from google.genai import types  # noqa: E402

print(f"project {project} | region {location} | model {model}")
print(f"sheet   {Path(sheets[0]).relative_to(BACKEND)}")

client = genai.Client(vertexai=True, project=project, location=location)
response = client.models.generate_content(
    model=model,
    contents=[
        types.Part.from_bytes(data=Path(sheets[0]).read_bytes(), mime_type="application/pdf"),
        "Return JSON with the fund name, its total expense ratio, and the exact line you read each from.",
    ],
    config=types.GenerateContentConfig(temperature=0, response_mime_type="application/json"),
)

print()
print(response.text)
print()
usage = response.usage_metadata
print(
    f"tokens: input {usage.prompt_token_count} | output {usage.candidates_token_count}"
    f" | thinking {usage.thoughts_token_count}"
)
