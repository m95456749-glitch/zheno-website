#!/usr/bin/env python3
"""Offline runner/security tests: fake subprocess transport, never Remote Supabase."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("migration_runner", ROOT / "scripts/product-image-migrate.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
MANIFEST = m.load_manifest()
BASE = [f[:14] for f in MANIFEST["required_baseline"]]
TARGET = MANIFEST["target"][:14]
V1 = MANIFEST["excluded_predecessors"][0][:14]
KEYS = ["id_types", "primary_consistent", "bucket_config", "rls_enabled", "browser_writes_revoked",
        "private_helpers_revoked", "rpc_acl_and_search_path", "storage_guards", "gallery_write_guards", "product_triggers"]


def environment(mode="plan"):
    # Synthetic fixture, not a real credential or project.
    return {"GITHUB_ACTIONS": "true", "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_SHA": "a" * 40,
            "MIGRATION_MODE": mode, "SUPABASE_PROJECT_REF": "a" * 20,
            "SUPABASE_DB_HOST": "aws-1-test-region.pooler.supabase.com",
            "SUPABASE_DB_PASSWORD": "fixture /:@%? رمز with trailing space ",
            "REVIEWED_COMMIT": "a" * 40, "REVIEWED_PROJECT_REF": "a" * 20, "CONFIRM_APPLY": m.CONFIRMATION,
            "BACKUP_AND_WRITERS_READY": "true"}


class FakeDatabase:
    def __init__(self, versions=None, failure=None, drift=False):
        self.versions = list(BASE if versions is None else versions)
        self.calls = []
        self.failure = failure
        self.history_reads = 0
        self.drift = drift

    def run(self, args, env, label, input_text=None):
        self.calls.append((args, env, label, input_text))
        if label == self.failure:
            raise m.SafetyError("Injected operation failure; no retry permitted.")
        if args == ["supabase", "--version"]:
            assert "SUPABASE_DB_PASSWORD" not in env
            return MANIFEST["cli_version"] + "\n"
        if args[0] == "psql":
            assert "default_transaction_read_only=on" in env["PGOPTIONS"]
            if "to_regclass('supabase_migrations.schema_migrations')" in input_text:
                return "true"
            if "json_agg(version" in input_text:
                self.history_reads += 1
                if self.drift and self.history_reads == 2:
                    return json.dumps(self.versions + [TARGET])
                return json.dumps(self.versions)
            if "product_id_text" in input_text:
                return json.dumps({"product_id_text": True, "private_bucket": False, "catalog_rls": True, "storage_rls": True})
            return json.dumps({k: True for k in KEYS})
        if label in ("CLI migration list", "CLI dry-run"):
            url = args[args.index("--db-url") + 1]
            assert "default_transaction_read_only=on" in parse_qs(urlsplit(url).query)["options"][0]
        if label == "CLI apply":
            assert "--include-all" not in args and "--include-seed" not in args and "--skip-vault" in args
            staged = Path(args[args.index("--workdir") + 1]) / "supabase/migrations"
            assert (staged / MANIFEST["target"]).read_bytes() == (ROOT / "supabase/migrations" / MANIFEST["target"]).read_bytes()
            self.versions = sorted(self.versions + [TARGET])
        return "captured CLI output (not printed)"

    def applied(self):
        return sum(c[2] == "CLI apply" for c in self.calls)


class AutomationTests(unittest.TestCase):
    def run_main(self, db, mode="plan", env=None):
        with contextlib.redirect_stdout(io.StringIO()):
            m.main(environment(mode) if env is None else env, run=db.run)

    def test_manifest_matches_complete_existing_files(self):
        self.assertEqual(len(m.load_manifest()["migrations"]), 5)

    def test_required_sql_changed_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT / "supabase", root / "supabase")
            with open(root / "supabase/migrations" / MANIFEST["target"], "a") as f:
                f.write("-- changed\n")
            with self.assertRaisesRegex(m.SafetyError, "content differs"):
                m.load_manifest(root)

    def test_unreviewed_extra_migration_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            shutil.copytree(ROOT / "supabase", root / "supabase")
            (root / "supabase/migrations/20260921000000_unreviewed.sql").write_text("select 1;")
            with self.assertRaisesRegex(m.SafetyError, "file set changed"):
                m.load_manifest(root)

    def test_plan_is_default_and_does_not_need_apply_phrase(self):
        env = environment();env.pop("MIGRATION_MODE");env.pop("CONFIRM_APPLY")
        self.assertEqual(m.authorize(env), "plan")

    def test_push_pr_and_schedule_cannot_authorize(self):
        for event in ["push", "pull_request", "pull_request_target", "schedule"]:
            with self.subTest(event=event):
                env = environment("apply");env["GITHUB_EVENT_NAME"] = event
                with self.assertRaises(m.SafetyError):
                    m.authorize(env)

    def test_apply_requires_exact_reviewed_commit(self):
        env = environment("apply");env["REVIEWED_COMMIT"] = "b" * 40
        with self.assertRaisesRegex(m.SafetyError, "commit SHA"):
            m.authorize(env)

    def test_apply_requires_reviewed_project_ref(self):
        env = environment("apply");env.pop("REVIEWED_PROJECT_REF")
        with self.assertRaises(m.SafetyError):
            m.authorize(env)

    def test_apply_rejects_target_changed_since_plan(self):
        env = environment("apply");env["REVIEWED_PROJECT_REF"] = "b" * 20
        with self.assertRaises(m.SafetyError):
            m.connection(env)

    def test_apply_requires_confirmation(self):
        env = environment("apply");env["CONFIRM_APPLY"] = "yes"
        with self.assertRaises(m.SafetyError):
            m.authorize(env)

    def test_apply_requires_backup_and_writer_acknowledgement(self):
        env = environment("apply");env["BACKUP_AND_WRITERS_READY"] = "false"
        with self.assertRaises(m.SafetyError):
            m.authorize(env)

    def test_password_is_encoded_not_normalized(self):
        from urllib.parse import unquote
        url, child = m.connection(environment())
        self.assertEqual(unquote(urlsplit(url).password), environment()["SUPABASE_DB_PASSWORD"])
        self.assertEqual(child["PGPASSWORD"], environment()["SUPABASE_DB_PASSWORD"])

    def test_tls_and_session_pooler_are_mandatory(self):
        url, env = m.connection(environment())
        self.assertEqual(urlsplit(url).port, 5432)
        self.assertEqual(parse_qs(urlsplit(url).query)["sslmode"], ["verify-full"])
        self.assertEqual(env["PGSSLMODE"], "verify-full")

    def test_host_injection_and_non_supabase_hosts_rejected(self):
        for host in ["localhost", "evil.example.org", "x.pooler.supabase.com.evil.org", "host; echo leak", "x.pooler.supabase.com:6543"]:
            with self.subTest(host=host):
                env = environment();env["SUPABASE_DB_HOST"] = host
                with self.assertRaises(m.SafetyError):
                    m.connection(env)

    def test_bad_project_ref_and_newline_password_rejected(self):
        for key, value in [("SUPABASE_PROJECT_REF", "../x"), ("SUPABASE_DB_PASSWORD", "bad\n"), ("SUPABASE_DB_PASSWORD", "")]:
            env = environment();env[key] = value
            with self.assertRaises(m.SafetyError):
                m.connection(env)

    def test_old_pg_settings_and_pat_are_not_forwarded(self):
        env = environment();env.update({"PGOPTIONS": "unsafe", "PGSERVICE": "other", "SUPABASE_ACCESS_TOKEN": "fixture", "DEBUG": "1"})
        _, child = m.connection(env)
        for key in ["PGOPTIONS", "PGSERVICE", "SUPABASE_ACCESS_TOKEN", "DEBUG"]:
            self.assertNotIn(key, child)

    def test_missing_history_is_failure_not_empty_database_assumption(self):
        with self.assertRaisesRegex(m.SafetyError, "history is missing"):
            m.history({}, lambda *a, **k: "false")

    def test_missing_seed_or_catalog_baseline_is_rejected(self):
        for versions in [[], BASE[:1], BASE[1:], [V1]]:
            with self.assertRaises(m.SafetyError):
                m.plan_files(MANIFEST, versions)

    def test_unknown_remote_migrations_rejected(self):
        with self.assertRaisesRegex(m.SafetyError, "unknown migrations"):
            m.plan_files(MANIFEST, BASE + ["20990101000000"])

    def test_duplicate_history_rejected(self):
        with self.assertRaisesRegex(m.SafetyError, "Duplicate"):
            m.plan_files(MANIFEST, BASE + BASE)

    def test_missing_v1_is_not_applied_or_falsely_baselined(self):
        staged, pending = m.plan_files(MANIFEST, BASE)
        self.assertNotIn(MANIFEST["excluded_predecessors"][0], staged)
        self.assertEqual(pending, [MANIFEST["target"]])

    def test_recorded_excluded_predecessors_are_rejected(self):
        for file in MANIFEST["excluded_predecessors"]:
            with self.assertRaisesRegex(m.SafetyError, "Unsupported predecessor"):
                m.plan_files(MANIFEST, BASE + [file[:14]])

    def test_target_already_applied_is_noop(self):
        self.assertEqual(m.plan_files(MANIFEST, BASE + [TARGET])[1], [])
        db = FakeDatabase(BASE + [TARGET]);self.run_main(db, "apply")
        self.assertEqual(db.applied(), 0)

    def test_staging_is_byte_exact_and_no_seed_files_are_copied(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "project"
            staged, _ = m.plan_files(MANIFEST, BASE)
            m.stage(ROOT, target, staged)
            self.assertFalse((target / "supabase/seed.sql").exists())
            for f in staged:
                self.assertEqual((target / "supabase/migrations" / f).read_bytes(), (ROOT / "supabase/migrations" / f).read_bytes())

    def test_plan_never_applies(self):
        db = FakeDatabase();self.run_main(db)
        self.assertEqual(db.applied(), 0)
        self.assertTrue(any(c[2] == "CLI dry-run" for c in db.calls))

    def test_apply_has_dryrun_before_write_and_postcheck_after(self):
        db = FakeDatabase();self.run_main(db, "apply")
        labels = [c[2] for c in db.calls]
        self.assertEqual(db.applied(), 1)
        self.assertLess(labels.index("CLI dry-run"), labels.index("CLI apply"))
        self.assertGreater(len(labels) - 1, labels.index("CLI apply"))

    def test_failed_dryrun_prevents_apply(self):
        db = FakeDatabase(failure="CLI dry-run")
        with self.assertRaises(m.SafetyError):
            self.run_main(db, "apply")
        self.assertEqual(db.applied(), 0)

    def test_history_drift_prevents_apply(self):
        db = FakeDatabase(drift=True)
        with self.assertRaisesRegex(m.SafetyError, "History changed"):
            self.run_main(db, "apply")
        self.assertEqual(db.applied(), 0)

    def test_cli_failure_is_not_retried_or_claimed_success(self):
        db = FakeDatabase(failure="CLI apply")
        with self.assertRaises(m.SafetyError):
            self.run_main(db, "apply")
        self.assertEqual(db.applied(), 1)

    def test_malformed_database_result_fails_closed(self):
        for response in ["", "ERROR: permission denied", "not json"]:
            with self.assertRaises(m.SafetyError):
                m.read_json("select 1;", {}, lambda *a, **k: response)

    def test_private_bucket_blocks_before_cli(self):
        with self.assertRaises(m.SafetyError):
            m.preflight({}, lambda *a, **k: json.dumps({"product_id_text": True, "private_bucket": True, "catalog_rls": True, "storage_rls": True}))

    def test_false_missing_or_wrong_postcheck_keys_fail(self):
        for checks in [{}, {"fake_check": True}, {k: k != "storage_guards" for k in KEYS}]:
            with self.assertRaises(m.SafetyError):
                m.verify({}, lambda *a, **k: json.dumps(checks))

    def test_process_error_never_echoes_credentials_or_raw_output(self):
        result = subprocess.CompletedProcess([], 1, "sensitive output", "sensitive stderr")
        with patch.object(m.subprocess, "run", return_value=result):
            with self.assertRaises(m.SafetyError) as ctx:
                m.execute(["example", "sensitive argument"], {}, "CLI apply")
            self.assertNotIn("sensitive", str(ctx.exception))
            self.assertIn("already be committed", str(ctx.exception))

    def test_workflow_is_manual_protected_pinned_and_not_a_frontend_deploy(self):
        text = (ROOT / ".github/workflows/supabase-migrate.yml").read_text()
        self.assertIn("workflow_dispatch:", text)
        self.assertNotRegex(text, r"(?m)^  (push|pull_request|pull_request_target|schedule):")
        self.assertIn("environment: supabase-production", text)
        self.assertIn("needs: offline-checks", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("persist-credentials: false", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("deploy-pages", text)
        self.assertNotIn("SUPABASE_ACCESS_TOKEN", text)
        self.assertEqual(text.count("secrets.SUPABASE_DB_PASSWORD"), 1)
        import re
        for action in re.findall(r"uses: (\S+)", text):
            self.assertRegex(action, r"@[0-9a-f]{40}$")

    def test_runner_does_not_implement_repair_or_include_all(self):
        # Check actual CLI argument literals, not explanatory comments.
        text = (ROOT / "scripts/product-image-migrate.py").read_text()
        for token in ['"--include-all"', '"--include-seed"', '"repair"', '"reset"', 'shell=True,']:
            self.assertNotIn(token, text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
