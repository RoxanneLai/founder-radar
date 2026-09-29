# Local storage and backend selection

RightRoom uses SQLite by default. A fresh checkout can run the dashboard, ingestion, run inspection, and review/publication without Docker, a database server, or database credentials. OpenRouter credentials and the explicit paid-call opt-in are still required for live ingestion.

## SQLite default

With no database environment variables, all workflows use:

```text
data/founder-radar.sqlite
```

The file and its SQLite sidecars are ignored by Git. The parent directory and schema are created automatically on first access. Foreign keys are enabled, writes use immediate transactions, concurrent readers use WAL mode, and lock waits are bounded. Do not commit the database: it contains private source evidence, run metadata, and review history.

Override the location when needed:

```bash
SQLITE_DATABASE_PATH=/absolute/private/path/founder-radar.sqlite npm run dev
```

Use the same environment value for the dashboard and every CLI command that should share that database. A relative path is resolved from the current working directory.

## Optional Supabase backend

Select Supabase explicitly:

```bash
DATABASE_BACKEND=supabase npm run dev
```

The dashboard then requires the local `SUPABASE_URL` and optional anonymous/public key described in [DASHBOARD.md](DASHBOARD.md). Live ingestion requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Review and inspection use the retained local Docker/Postgres workflow. Hosted endpoints remain rejected by these development workflows.

`DATABASE_BACKEND` accepts only `sqlite` or `supabase`. RightRoom never falls back to the other backend after a connection or configuration failure. Changing this setting does not copy, merge, overwrite, or delete data.

## Backups

Stop the development server and any RightRoom CLI using the database before copying it. Copy `data/founder-radar.sqlite` to a private backup location. If `-wal` or `-shm` sidecar files remain, copy them with the database as one set. Restore only while no process has the database open.

For a custom `SQLITE_DATABASE_PATH`, back up that path instead. Protect backups like credentials: they contain private evidence even though they do not contain the OpenRouter key.

## Explicit import from local Supabase

Import is a separate operator action, never part of backend selection:

```bash
npm run db:import:supabase -- --to data/imported-founder-radar.sqlite
```

The command reads only the local `supabase_db_founder-radar` container over its Unix Docker socket. It preserves run IDs, event/source IDs and links, private evidence, run metadata, publication reviews, and approval history. It creates the SQLite schema and refuses a target containing any RightRoom records. It does not modify Supabase, switch the application backend, publish events, call a model, or delete either database.

Inspect the imported database before selecting it:

```bash
DATABASE_BACKEND=sqlite \
SQLITE_DATABASE_PATH=data/imported-founder-radar.sqlite \
npm run review -- list
```

Back up both databases before a real import. Keep the original Supabase database until the imported data has been checked.

## Deployment limits

SQLite is intended for this single-machine portfolio application and small local workflows. A deployment must provide a persistent writable volume and keep `SQLITE_DATABASE_PATH` on it. Ephemeral or read-only hosting will lose data or fail safely. Do not run multiple application instances against separate copies and expect them to synchronize.

Supabase remains the better option when the application needs a managed database, multiple hosts, stronger operational tooling, or independent public API access. Choosing Supabase for deployment is explicit and does not trigger data migration.
