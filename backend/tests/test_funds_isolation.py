"""The funds catalogue must stay out of the nightly analysis pipeline.

This is the test that defends the central design decision, and it is worth
stating why the decision is not merely tidy.

A fund has no StockTwits stream, so the sentiment phase would score it a neutral
50. Convergence reads a strong quantitative lean against a neutral sentiment
lean as *conflict* and penalises it, so a fund would not merely be unscored — it
would be actively demoted. Data sufficiency would lose a third of its term for
the same reason. And the quantitative phase ranks percentiles across the night's
candidate set, so a Top-40 tracker would be positioned relative to Nvidia.

None of that fails loudly. It produces a number, and the number is meaningless.
So the guarantee is structural: the pipeline does not import this package, and
if someone later reaches for it, this test says why they should not.

Both halves are checked. The static half reads the source, so it catches an
import that is written but never executed. The runtime half imports the pipeline
and looks at what actually loaded, so it catches an import reached indirectly.
"""

from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

# Every module that runs as part of the nightly analysis.
PIPELINE_MODULES = (
    "src/orchestration/langgraph_orchestrator.py",
    "src/orchestration/ranking.py",
    "src/utils/rec_writer.py",
    "src/agents/asset_discovery.py",
    "src/agents/quant_analyst.py",
    "src/agents/sentiment_scout.py",
)

FUNDS_PACKAGE = "src.funds"


def imported_names(path: Path) -> set[str]:
    """Every module name this file imports, however it is written."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                names.add(node.module)
            # A relative "from . import funds" carries no module name.
            if node.level and node.module is None:
                names.update(alias.name for alias in node.names)
    return names


class TestThePipelineDoesNotKnowAboutFunds:
    @pytest.mark.parametrize("relative", PIPELINE_MODULES)
    def test_no_pipeline_module_imports_the_funds_package(self, relative):
        path = BACKEND_ROOT / relative
        assert path.exists(), f"{relative} moved; update this test rather than deleting it"
        offenders = {name for name in imported_names(path) if "funds" in name.split(".")}
        assert not offenders, (
            f"{relative} imports {sorted(offenders)}. Funds must not enter the nightly "
            f"pipeline: a fund has no social coverage, so convergence would read it as "
            f"conflict and demote it, and its percentiles would be computed against equities."
        )

    def test_the_pipeline_is_not_loaded_when_the_funds_package_is(self):
        # And the reverse of the static check: importing the catalogue must not
        # drag the analysis pipeline in either, or the two become one deployment
        # concern.
        probe = (
            "import sys;"
            "sys.path.insert(0, %r);"
            "import src.funds.service;"
            "loaded = [m for m in sys.modules if 'langgraph' in m or 'rec_writer' in m];"
            "print(loaded)" % str(BACKEND_ROOT)
        )
        result = subprocess.run(
            [sys.executable, "-c", probe],
            cwd=str(BACKEND_ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert result.returncode == 0, result.stderr[-1500:]
        assert result.stdout.strip().endswith("[]"), result.stdout


class TestTheApiOnlyReachesFundsBehindTheFlag:
    def test_every_funds_import_in_the_api_sits_under_the_flag(self):
        source = (BACKEND_ROOT / "src" / "api.py").read_text(encoding="utf-8")
        tree = ast.parse(source, filename="api.py")

        # Collect the funds imports that are nested inside an `if` block, and
        # those that are not.
        guarded: list[str] = []
        unguarded: list[str] = []

        for node in ast.walk(tree):
            if not isinstance(node, ast.If):
                continue
            test_source = ast.get_source_segment(source, node.test) or ""
            if "FUNDS_ENABLED" not in test_source:
                continue
            for inner in ast.walk(node):
                if isinstance(inner, (ast.Import, ast.ImportFrom)):
                    module = getattr(inner, "module", None) or ""
                    if "funds" in module:
                        guarded.append(module)

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and (node.module or "").startswith(FUNDS_PACKAGE):
                # The flag module itself is imported unconditionally, which is
                # the point: reading a flag must not load the feature.
                if node.module != f"{FUNDS_PACKAGE}.config" and node.module not in guarded:
                    unguarded.append(node.module)

        assert guarded, "api.py no longer imports the funds routes under the flag"
        assert not unguarded, f"api.py imports {unguarded} without a FUNDS_ENABLED guard"

    def test_only_the_flag_module_loads_when_the_flag_is_off(self):
        # The strongest form of the claim: with the flag unset, importing the
        # whole API leaves the feature on disk.
        probe = (
            "import os, sys;"
            "os.environ.pop('FUNDS_ENABLED', None);"
            "sys.path.insert(0, %r);"
            "import src.api;"
            "print(sorted(m for m in sys.modules if m.startswith('src.funds')))" % str(BACKEND_ROOT)
        )
        result = subprocess.run(
            [sys.executable, "-c", probe],
            cwd=str(BACKEND_ROOT),
            capture_output=True,
            text=True,
            timeout=180,
        )
        assert result.returncode == 0, result.stderr[-1500:]
        loaded = result.stdout.strip().splitlines()[-1]
        assert loaded == "['src.funds', 'src.funds.config']", loaded
