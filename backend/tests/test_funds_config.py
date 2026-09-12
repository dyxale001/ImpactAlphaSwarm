"""Tests for the funds-catalogue feature flags.

The claim being defended is the one that makes merging this feature safe before
it is finished: with no environment set, the funds package is inert. Every other
test in this suite is evidence that the existing pipeline still works; this file
is the evidence that it still works *because the flags are off*, not by accident.

The second claim is that the flags fail closed. A flag read as truthy from "1" or
"yes" would switch a half-finished feature on for whoever set it that way, so the
only string that counts is "true".

No Supabase, no network: config.py imports nothing but os.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.funds import config  # noqa: E402


class TestFlagReader:
    """INVARIANT: only the literal string "true" enables anything."""

    def test_true_in_any_case_and_padding_enables(self, monkeypatch):
        for raw in ("true", "TRUE", "True", "tRuE", " true", "true ", "  TRUE  "):
            monkeypatch.setenv("FUNDS_TEST_FLAG", raw)
            assert config._flag("FUNDS_TEST_FLAG") is True, raw

    def test_every_other_value_fails_closed(self, monkeypatch):
        # "1" and "yes" are the two an operator is most likely to reach for, and
        # both must be false: a feature that switches on from a guessed value is
        # a feature nobody can prove is off.
        for raw in ("false", "False", "1", "0", "yes", "no", "on", "off", "", " ", "truthy", "true-ish"):
            monkeypatch.setenv("FUNDS_TEST_FLAG", raw)
            assert config._flag("FUNDS_TEST_FLAG") is False, raw

    def test_unset_uses_the_default_which_is_false(self, monkeypatch):
        monkeypatch.delenv("FUNDS_TEST_FLAG", raising=False)
        assert config._flag("FUNDS_TEST_FLAG") is False
        assert config._flag("FUNDS_TEST_FLAG", "true") is True


def reload_without(*names: str, monkeypatch):
    """Reload the config with the named variables absent from the environment.

    Necessary because ``backend/.env`` is read during collection, so a developer
    who has switched the feature on locally would otherwise see these tests go
    red. The default is a property of the code, not of whoever is running it, so
    the test has to control the environment rather than read it.
    """
    for name in names:
        monkeypatch.delenv(name, raising=False)
    return importlib.reload(config)


class TestDefaults:
    """PINNED VALUE: the shipped defaults. A failure here means a default moved.

    If one of these legitimately changes, update it in the same commit that
    changes the constant — and know that flipping either flag to on by default
    makes the feature live for every deployment that has not opted in.
    """

    def test_both_feature_flags_are_off(self, monkeypatch):
        reloaded = reload_without("FUNDS_ENABLED", "FUND_TRACES_ENABLED", monkeypatch=monkeypatch)
        try:
            assert reloaded.FUNDS_ENABLED is False
            assert reloaded.FUND_TRACES_ENABLED is False
        finally:
            monkeypatch.undo()
            importlib.reload(config)

    def test_storage_and_platform_settings(self):
        assert config.MDD_BUCKET == "mdd"
        assert config.MDD_SIGNED_URL_TTL_SECONDS == 3600
        # None means "this platform has no monthly minimum", which is the truth
        # for the platform the catalogue is bounded to. The eligibility rule
        # treats None as "no constraint", so a stray 0 here would be read as a
        # real minimum of zero rather than an absent one.
        assert config.PLATFORM_MIN_DEBIT_ORDER is None


class TestEnvironmentIsActuallyRead:
    """INVARIANT: the module constants come from the environment, not literals.

    Reloading is the only way to test an import-time constant. It proves the
    wiring rather than re-testing ``_flag``: a constant hard-coded to False would
    pass every test above and still be unflippable in production.
    """

    def test_flags_flip_when_the_environment_says_true(self, monkeypatch):
        monkeypatch.setenv("FUNDS_ENABLED", "true")
        monkeypatch.setenv("FUND_TRACES_ENABLED", "TRUE")
        monkeypatch.setenv("FUNDS_MDD_URL_TTL", "900")
        reloaded = importlib.reload(config)
        try:
            assert reloaded.FUNDS_ENABLED is True
            assert reloaded.FUND_TRACES_ENABLED is True
            assert reloaded.MDD_SIGNED_URL_TTL_SECONDS == 900
        finally:
            # Leave the module as the rest of the suite expects to find it.
            monkeypatch.undo()
            importlib.reload(config)

    def test_reload_restores_the_documented_ttl(self, monkeypatch):
        # REGRESSION GUARD for the test above: a leaked reload would make every
        # later assertion meaningless. The TTL is checked rather than the flags,
        # because the flags legitimately reflect whatever `.env` says once the
        # module is reloaded from a real environment.
        monkeypatch.delenv("FUNDS_MDD_URL_TTL", raising=False)
        reloaded = importlib.reload(config)
        try:
            assert reloaded.MDD_SIGNED_URL_TTL_SECONDS == 3600
        finally:
            monkeypatch.undo()
            importlib.reload(config)
