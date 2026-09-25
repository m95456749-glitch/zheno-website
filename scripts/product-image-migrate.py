#!/usr/bin/env python3
"""Manual-only image upgrade. SQL stays in complete, hash-pinned migration files.

No Management API, PAT, service key, migration repair, seed replay or shell=True.
Remote reads use psql in enforced read-only transactions. CLI output is captured,
not printed: even an error can contain credentials or production row contents.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import struct
import subprocess
import sys
import tempfile
from urllib.parse import quote, urlencode

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "supabase/product-image-migration-manifest.json"
CONFIRMATION = "APPLY_PRODUCT_IMAGES_V3"


class SafetyError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise SafetyError(message)


def load_manifest(root=ROOT):
    manifest = json.loads((root / "supabase/product-image-migration-manifest.json").read_text())
    files = manifest["migrations"]
    require(set(files) == {p.name for p in (root / "supabase/migrations").glob("*.sql")},
            "Migration file set changed; review and update the audited manifest first.")
    require(len({name[:14] for name in files}) == len(files), "Duplicate local migration versions.")
    for name, digest in files.items():
        require(re.fullmatch(r"\d{14}_[a-z0-9_]+\.sql", name), "Invalid migration filename.")
        data = (root / "supabase/migrations" / name).read_bytes()
        require(hashlib.sha256(data).hexdigest() == digest,
                "Migration content differs from the audited manifest; review required.")
    require(manifest["target"] in files and set(manifest["excluded_predecessors"]) <= set(files),
            "Invalid migration manifest.")
    require(set(manifest["required_baseline"]) | {manifest["target"]} | set(manifest["excluded_predecessors"]) == set(files),
            "Invalid migration baseline.")
    require(manifest["target"] == max(files), "Target must be the newest audited migration.")
    return manifest


def authorize(env):
    require(env.get("GITHUB_ACTIONS") == "true" and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch",
            "This entrypoint only runs from a manually dispatched GitHub Actions workflow.")
    mode = env.get("MIGRATION_MODE", "plan")
    require(mode in ("plan", "apply"), "Unsupported mode.")
    require(re.fullmatch(r"[0-9a-f]{40}", env.get("GITHUB_SHA", "")), "Invalid commit SHA.")
    if mode == "apply":
        require(re.fullmatch(r"[a-z]{20}", env.get("REVIEWED_PROJECT_REF", "")),
                "Apply requires the project reference ID shown in the successful plan.")
        require(env.get("REVIEWED_COMMIT") == env["GITHUB_SHA"],
                "Apply requires the exact full commit SHA reviewed in the successful plan.")
        require(env.get("CONFIRM_APPLY") == CONFIRMATION,
                "Apply confirmation phrase is missing or incorrect.")
        require(env.get("BACKUP_AND_WRITERS_READY") == "true",
                "Confirm a recoverable backup, paused writers and coordination with the v3 admin UI.")
    return mode


def connection(env):
    ref = env.get("SUPABASE_PROJECT_REF", "")
    host = env.get("SUPABASE_DB_HOST", "")
    password = env.get("SUPABASE_DB_PASSWORD", "")
    require(re.fullmatch(r"[a-z]{20}", ref), "Set SUPABASE_PROJECT_REF to the project's 20-letter reference ID.")
    if env.get("MIGRATION_MODE") == "apply":
        require(env.get("REVIEWED_PROJECT_REF") == ref,
                "Target project differs from the reviewed plan. No connection attempted.")
    require(re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com", host),
            "Set SUPABASE_DB_HOST to the exact shared Session pooler host from Dashboard > Connect.")
    require(password and not any(c in password for c in "\x00\r\n"),
            "SUPABASE_DB_PASSWORD is missing or contains a newline/NUL; it is never normalized.")
    ca = "/etc/ssl/certs/ca-certificates.crt"
    require(Path(ca).is_file(), "System CA certificate bundle is missing.")
    user = "postgres." + ref
    params = urlencode({"sslmode": "verify-full", "sslrootcert": ca, "connect_timeout": "15"})
    url = f"postgresql://{user}:{quote(password, safe='')}@{host}:5432/postgres?{params}"
    # Do not forward arbitrary libpq overrides, PATs, service keys or debugging.
    child = {k: v for k, v in env.items() if not k.startswith(("PG", "SUPABASE_", "DEBUG"))}
    child.update({"PGHOST": host, "PGPORT": "5432", "PGUSER": user, "PGDATABASE": "postgres",
                  "PGPASSWORD": password, "PGSSLMODE": "verify-full", "PGSSLROOTCERT": ca,
                  "PGCONNECT_TIMEOUT": "15", "PGAPPNAME": "zhino-images-manual-migration"})
    return url, child


def mask(value):
    # GitHub workflow-command escaping, including percent-encoded passwords.
    print("::add-mask::" + value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A"), flush=True)


def psql_failure_category(stderr):
    text = (stderr or "").lower()
    checks = [
        ("dns_failure", ("could not translate host name", "temporary failure in name resolution", "name or service not known")),
        ("tcp_connection_refused", ("connection refused",)),
        ("tcp_connection_timeout", ("connection timed out", "timeout expired", "operation timed out", "could not connect to server: connection timed out")),
        ("tls_certificate_failure", ("certificate verify failed", "server certificate", "could not get server certificate", "root certificate")),
        ("tls_not_supported", ("does not support ssl",)),
        ("authentication_failure", ("password authentication failed", "authentication failed", "scram authentication failed", "no password supplied")),
        ("network_access_denied", ("no pg_hba.conf entry", "network is unreachable")),
        ("connection_closed_or_reset", ("connection reset", "server closed the connection unexpectedly", "ssl syscall error", "eof detected", "terminating connection")),
        ("postgresql_query_failure", ("syntax error", "permission denied", "must be owner", "does not exist")),
    ]
    for category, needles in checks:
        if any(needle in text for needle in needles):
            return category
    return "unknown_psql_failure"


def postgres_network_diagnostic(env):
    host = env.get("PGHOST", "")
    port_text = env.get("PGPORT", "5432")
    ca = env.get("PGSSLROOTCERT", "/etc/ssl/certs/ca-certificates.crt")
    if not host:
        return "configuration_failure", "PGHOST was not set for the read-only check."
    try:
        port = int(port_text)
    except (TypeError, ValueError):
        return "configuration_failure", "PGPORT is not a valid integer."
    target = f"{host}:{port}"
    try:
        socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return "dns_failure", f"DNS lookup failed for {target}."

    sock = None
    try:
        sock = socket.create_connection((host, port), timeout=10)
        sock.settimeout(10)
        # PostgreSQL TLS is negotiated by an SSLRequest packet before the startup
        # packet; no username, password or SQL is sent by this diagnostic.
        sock.sendall(struct.pack("!II", 8, 80877103))
        response = sock.recv(1)
        if response == b"S":
            context = ssl.create_default_context(cafile=ca if Path(ca).is_file() else None)
            with context.wrap_socket(sock, server_hostname=host) as tls:
                tls.version()
            return "network_tls_ok", f"DNS, TCP and PostgreSQL TLS negotiation succeeded for {target}; authentication/query is the next layer."
        if response == b"N":
            return "tls_not_supported", f"{target} accepted TCP but rejected PostgreSQL TLS; verify-full cannot be used with this endpoint."
        if response == b"":
            return "postgres_protocol_connection_closed", f"{target} accepted TCP but closed before PostgreSQL TLS negotiation; check Supabase network restrictions, pooler endpoint and port."
        return "postgres_protocol_unexpected_response", f"{target} returned an unexpected PostgreSQL TLS negotiation response; check pooler endpoint and port."
    except ssl.SSLCertVerificationError:
        return "tls_certificate_failure", f"TLS certificate verification failed for {target}."
    except ssl.SSLError:
        return "tls_failure", f"TLS negotiation failed for {target}."
    except (ConnectionResetError, BrokenPipeError):
        return "postgres_protocol_connection_reset", f"{target} accepted TCP but reset the PostgreSQL handshake before authentication; check Supabase network restrictions, pooler endpoint and port."
    except socket.timeout:
        return "tcp_or_postgres_protocol_timeout", f"Timed out while connecting or negotiating PostgreSQL TLS with {target}."
    except OSError:
        return "tcp_connection_failure", f"TCP connection to {target} failed."
    finally:
        try:
            if sock is not None:
                sock.close()
        except OSError:
            pass


def safe_process_failure(label, result, env):
    if label != "Read-only database check":
        return (label +
                " failed; raw output withheld to protect secrets/data. If apply started, SQL may already be committed; inspect history before retrying.")
    psql_category = psql_failure_category(result.stderr)
    network_category, network_detail = postgres_network_diagnostic(env)
    return (
        f"{label} failed; psql_category={psql_category}; network_diagnostic={network_category}. "
        f"{network_detail} Raw psql output withheld to protect secrets/data; no migration SQL was executed."
    )


def execute(args, env, label, input_text=None):
    try:
        result = subprocess.run(args, input=input_text, text=True, capture_output=True,
                                env=env, timeout=180, check=False)
    except (OSError, subprocess.TimeoutExpired):
        if label == "Read-only database check":
            network_category, network_detail = postgres_network_diagnostic(env)
            raise SafetyError(
                f"{label} failed or timed out; network_diagnostic={network_category}. "
                f"{network_detail} Raw output withheld; no migration SQL was executed."
            ) from None
        raise SafetyError(label + " failed or timed out; raw output withheld. Check connectivity/history before retrying.") from None
    require(result.returncode == 0, safe_process_failure(label, result, env))
    return result.stdout


def read_json(sql, env, run=execute):
    readonly = dict(env)
    readonly["PGOPTIONS"] = "-c default_transaction_read_only=on -c statement_timeout=30000 -c lock_timeout=5000"
    text = run(["psql", "--no-psqlrc", "--no-password", "--tuples-only", "--no-align", "--quiet",
                "--set=ON_ERROR_STOP=1"], readonly, "Read-only database check", input_text=sql)
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        raise SafetyError("Unexpected read-only database response; refusing to infer an empty history.") from None


def history(env, run=execute):
    exists = read_json("select (to_regclass('supabase_migrations.schema_migrations') is not null)::text;", env, run)
    require(exists is True, "Migration history is missing. Stop for a reviewed baseline; no repair, seed or v1 replay was attempted.")
    versions = read_json("select coalesce(json_agg(version order by version),'[]'::json) from supabase_migrations.schema_migrations;", env, run)
    require(isinstance(versions, list) and all(isinstance(v, str) and re.fullmatch(r"\d{14}", v) for v in versions),
            "Invalid migration history response.")
    return versions


def plan_files(manifest, versions):
    require(len(versions) == len(set(versions)), "Duplicate remote migration versions; review required.")
    by_version = {f[:14]: f for f in manifest["migrations"]}
    require(set(versions) <= set(by_version), "Remote contains unknown migrations; do not repair or include-all automatically.")
    require(all(f[:14] in versions for f in manifest["required_baseline"]),
            "Catalog/seed baseline is not recorded. Review actual schema/history before any apply; no automatic baseline repair.")
    require(not (set(versions) & {f[:14] for f in manifest["excluded_predecessors"]}),
            "Unsupported predecessor history: v3 requires only the recorded catalog/seed baseline; stop for review.")
    # Stage byte-identical recorded baseline + v3 ONLY. Never apply or fabricate
    # history for the excluded v1/v2 files. No --include-all or seed replay.
    staged = sorted({by_version[v] for v in versions} | {manifest["target"]})
    pending = [] if manifest["target"][:14] in versions else [manifest["target"]]
    return staged, pending


def preflight(env, run=execute):
    result = read_json("""select json_build_object(
      'product_id_text',exists(select 1 from pg_attribute where attrelid=to_regclass('public.products') and attname='id' and atttypid='text'::regtype and not attisdropped),
      'private_bucket',exists(select 1 from storage.buckets where id='product-images' and public is distinct from true),
      'catalog_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.products')),false),
      'storage_rls',coalesce((select relrowsecurity from pg_class where oid=to_regclass('storage.objects')),false));""", env, run)
    require(result == {"product_id_text": True, "private_bucket": False, "catalog_rls": True, "storage_rls": True},
            "Remote catalog/RLS/bucket preflight failed. No changes were requested; do not disable guards.")


def stage(root, destination, files):
    directory = destination / "supabase/migrations"
    directory.mkdir(parents=True)
    shutil.copyfile(root / "supabase/config.toml", destination / "supabase/config.toml")
    for name in files:
        shutil.copyfile(root / "supabase/migrations" / name, directory / name)
    # Exact complete files: no placeholders, SQL slicing or modified migration body.
    require(all((directory / n).read_bytes() == (root / "supabase/migrations" / n).read_bytes() for n in files),
            "Staged migration copy mismatch.")


def verify(env, run=execute, root=ROOT):
    checks = read_json((root / "supabase/check-product-image-upgrade.sql").read_text(), env, run)
    expected = {"id_types", "primary_consistent", "bucket_config", "rls_enabled", "browser_writes_revoked",
                "private_helpers_revoked", "rpc_acl_and_search_path", "storage_guards", "gallery_write_guards", "product_triggers"}
    require(isinstance(checks, dict) and set(checks) == expected and all(value is True for value in checks.values()),
            "Post-apply image invariant/security check failed. COMMIT may have completed; this is NOT an automatic rollback.")


def report(mode, sha, manifest, staged, pending, status, project_ref):
    # Allowlisted metadata only. Never write raw SQL responses/CLI logs to artifacts.
    lines = ["### Product image migration", f"- Mode: `{mode}`", f"- Target project ref: `{project_ref}`", f"- Reviewed source commit: `{sha}`",
             f"- Target SQL SHA-256: `{manifest['migrations'][manifest['target']]}`",
             f"- Pending: `{', '.join(pending) or 'none'}`", f"- Status: {status}",
             "- Complete CLI files: " + ", ".join(f"`{name}`" for name in staged),
             "- No seed/v1 replay, history repair, frontend deploy or merge."]
    message = "\n".join(lines) + "\n"
    print(message)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(message)


def main(env=None, root=ROOT, run=execute):
    env = dict(os.environ if env is None else env)
    mode = authorize(env)
    manifest = load_manifest(root)
    clean = {k: v for k, v in env.items() if not k.startswith(("PG", "SUPABASE_", "DEBUG"))}
    require(run(["supabase", "--version"], clean, "CLI version check").strip() == manifest["cli_version"],
            "Unexpected Supabase CLI version; no connection attempted.")
    url, child = connection(env)
    mask(env["SUPABASE_DB_PASSWORD"])
    mask(quote(env["SUPABASE_DB_PASSWORD"], safe=""))
    mask(url)
    versions = history(child, run)
    staged, pending = plan_files(manifest, versions)
    preflight(child, run)
    with tempfile.TemporaryDirectory(prefix="zhino-images-") as temp:
        stage(root, Path(temp), staged)
        # A read-only server default ALSO applies to CLI dry-run/list connections.
        # If a CLI release tries to initialize history/vault here, it must fail.
        ro_url = url + "&" + urlencode({"options": "-c default_transaction_read_only=on -c statement_timeout=30000"})
        mask(ro_url)
        run(["supabase", "migration", "list", "--db-url", ro_url, "--workdir", temp], child, "CLI migration list")
        run(["supabase", "db", "push", "--dry-run", "--skip-vault", "--db-url", ro_url, "--workdir", temp], child, "CLI dry-run")
        report(mode, env["GITHUB_SHA"], manifest, staged, pending, "History/preflight/CLI dry-run passed; migration SQL was not executed by dry-run.", env["SUPABASE_PROJECT_REF"])
        if mode == "plan":
            return
        require(history(child, run) == versions, "History changed after planning; no apply attempted. Run a new plan.")
        if pending:
            print("Explicitly authorized apply starting; a later error does not prove rollback.", flush=True)
            run(["supabase", "db", "push", "--skip-vault", "--db-url", url, "--workdir", temp, "--yes"], child, "CLI apply")
        expected = sorted(set(versions) | {manifest["target"][:14]})
        require(history(child, run) == expected, "Post-apply history differs from the approved target; inspect before retrying.")
        verify(child, run, root)
        report(mode, env["GITHUB_SHA"], manifest, staged, pending, "Apply/no-op and read-only image/security verification passed.", env["SUPABASE_PROJECT_REF"])


if __name__ == "__main__":
    try:
        main()
    except SafetyError as error:
        print("::error::" + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # Do not include exceptions that might embed a connection string or row.
        print("::error::Unexpected runner failure; details withheld. Inspect configuration and history before retrying.", file=sys.stderr)
        sys.exit(1)
