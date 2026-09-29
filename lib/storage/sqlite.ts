import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Json } from "../database.types.ts";

const SCHEMA_VERSION = 2;

const SCHEMA = `
create table if not exists search_runs (
  id text primary key,
  agent_name text not null check (trim(agent_name) <> ''),
  agent_version text,
  provider text not null check (trim(provider) <> ''),
  search_parameters text not null default '{}' check (json_valid(search_parameters)),
  status text not null default 'running' check (
    status in ('queued','running','succeeded','partial','failed','cancelled')
  ),
  started_at text not null,
  completed_at text,
  sources_discovered integer not null default 0 check (sources_discovered >= 0),
  sources_created integer not null default 0 check (sources_created >= 0),
  sources_updated integer not null default 0 check (sources_updated >= 0),
  error_message text,
  metadata text not null default '{}' check (json_valid(metadata)),
  created_at text not null,
  updated_at text not null
);

create table if not exists events (
  id text primary key,
  title text not null check (trim(title) <> ''),
  organizer_name text check (organizer_name is null or trim(organizer_name) <> ''),
  starts_at text not null,
  ends_at text,
  time_zone text not null default 'America/New_York' check (trim(time_zone) <> ''),
  venue_name text,
  address_line text,
  neighborhood text,
  borough text,
  city text not null default 'New York',
  region text not null default 'NY',
  country_code text not null default 'US' check (length(country_code) = 2),
  event_format text not null default 'in-person' check (
    event_format in ('in-person','hybrid','virtual')
  ),
  categories text not null default '[]' check (json_valid(categories)),
  price_amount_cents integer check (price_amount_cents is null or price_amount_cents >= 0),
  currency_code text check (currency_code is null or length(currency_code) = 3),
  registration_status text not null default 'unknown' check (
    registration_status in ('unknown','open','almost-full','waitlist','closed','cancelled')
  ),
  publication_status text not null default 'draft' check (
    publication_status in ('draft','published','archived')
  ),
  is_fixture integer not null default 0 check (is_fixture in (0,1)),
  founder_score integer check (founder_score is null or founder_score between 0 and 100),
  investor_score integer check (investor_score is null or investor_score between 0 and 100),
  networking_score integer check (networking_score is null or networking_score between 0 and 100),
  recommendation text,
  potential_downside text,
  scoring_version text,
  first_seen_at text not null,
  last_seen_at text not null,
  published_at text,
  public_registration_url text,
  created_at text not null,
  updated_at text not null,
  check (ends_at is null or ends_at > starts_at),
  check ((price_amount_cents is null) = (currency_code is null)),
  check (last_seen_at >= first_seen_at),
  check (publication_status <> 'published' or published_at is not null)
);

create table if not exists event_sources (
  id text primary key,
  event_id text references events(id) on delete set null,
  discovered_by_run_id text references search_runs(id) on delete set null,
  source_name text not null check (trim(source_name) <> ''),
  source_kind text not null default 'listing' check (
    source_kind in ('listing','organizer','calendar','other')
  ),
  external_id text check (external_id is null or trim(external_id) <> ''),
  source_url text not null check (source_url like 'https://%'),
  registration_url text,
  fetched_at text,
  first_seen_at text not null,
  last_seen_at text not null,
  last_attempt_at text,
  last_attempt_error text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  content_hash text,
  content_text text,
  raw_payload text not null default '{}' check (json_valid(raw_payload)),
  created_at text not null,
  updated_at text not null,
  check (last_seen_at >= first_seen_at)
);

create table if not exists event_publication_reviews (
  id text primary key,
  event_id text not null references events(id),
  source_id text not null references event_sources(id),
  review_token text not null check (length(review_token) = 64),
  review_snapshot text not null check (json_valid(review_snapshot)),
  approved_at text not null,
  approved_by_role text not null default 'local_operator'
);

create index if not exists events_starts_at_idx on events(starts_at);
create index if not exists events_publication_starts_at_idx
  on events(publication_status, starts_at);
create index if not exists event_sources_event_id_idx on event_sources(event_id);
create index if not exists event_sources_discovered_by_run_id_idx
  on event_sources(discovered_by_run_id);
create index if not exists event_sources_last_seen_at_idx
  on event_sources(last_seen_at desc);
create unique index if not exists event_sources_source_external_id_key
  on event_sources(source_name, external_id) where external_id is not null;
create unique index if not exists event_sources_source_url_key
  on event_sources(source_name, source_url);
create index if not exists search_runs_started_at_idx on search_runs(started_at desc);
create index if not exists publication_reviews_event_idx
  on event_publication_reviews(event_id, approved_at desc);
`;

export type SqliteDatabase = DatabaseSync;

function migrate(database: DatabaseSync): void {
  const version = database.prepare("pragma user_version").get() as
    { user_version: number } | undefined;
  if ((version?.user_version ?? 0) > SCHEMA_VERSION)
    throw new Error("sqlite_schema_too_new");
  if ((version?.user_version ?? 0) === SCHEMA_VERSION) return;
  database.exec("begin immediate");
  try {
    database.exec(SCHEMA);
    if ((version?.user_version ?? 0) < 2) {
      database.exec(
        "alter table events add column career_assessment text check (career_assessment is null or json_valid(career_assessment))",
      );
      database.exec(`create table lead_recovery_audits (
        id text primary key, source_id text not null references event_sources(id),
        event_id text not null references events(id), approved_at text not null,
        preview_token text not null, snapshot text not null check (json_valid(snapshot))
      )`);
    }
    database.exec(`pragma user_version = ${SCHEMA_VERSION}`);
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

/** Open one local database with safe concurrency defaults and automatic migrations. */
export function openSqliteDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path);
  try {
    database.exec("pragma foreign_keys = on");
    database.exec("pragma busy_timeout = 5000");
    database.exec("pragma journal_mode = wal");
    database.exec("pragma synchronous = normal");
    migrate(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function withImmediateTransaction<T>(
  database: DatabaseSync,
  operation: () => T,
): T {
  database.exec("begin immediate");
  try {
    const result = operation();
    database.exec("commit");
    return result;
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}

export function newId(): string {
  return randomUUID();
}

export function jsonText(value: Json): string {
  return JSON.stringify(value);
}

export function parseJson(value: unknown): Json {
  if (typeof value !== "string") throw new Error("invalid_sqlite_json");
  return JSON.parse(value) as Json;
}
