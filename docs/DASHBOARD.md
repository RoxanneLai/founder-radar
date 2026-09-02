# Database-backed dashboard

## What changed

The main route (`/`) now reads the local database at request time. The original fictional edition has moved to `/sample`, with clear labels, no registration links, and indexing disabled. There is no automatic sample fallback when the database is empty, unavailable, or unconfigured.

Page loads never run the ingestion agent, call OpenAI, calculate scores, publish drafts, or write to the database.

## Connect the local database

1. Keep Docker Desktop running and use `npm run db:start` for ordinary startup. Do **not** reset existing data.
   Apply pending migrations with `npm run db:migrate` after reviewing them. The reviewed-link addition requires `20260902061000`; without its new column, the updated feed returns its safe unavailable state. The overnight cycle did not migrate the normal database.
2. In your regular Terminal, run `npm run db:status` to confirm the local API URL. Authentication is disabled in this project's local configuration, so no anonymous API key is issued or needed for public reads.
3. Set the following value in your own ignored `.env.local`, or export it in the Terminal used to start Next.js:

   ```dotenv
   SUPABASE_URL=http://127.0.0.1:54321
   ```

4. Run `npm run dev` and open `http://localhost:3000`. Restart the server after changing environment values.

The dashboard accepts a local loopback URL with an explicit port only. In this project's auth-disabled local mode, leave `SUPABASE_ANON_KEY` unset: requests contain no credentials and PostgREST applies the anonymous database role. The SDK's required construction placeholder is stripped before any HTTP request and is never sent.

If you deliberately enable authentication in the local stack later, also supply `SUPABASE_ANON_KEY` with its anonymous/public key. The dashboard accepts an anonymous-role JWT or a public `sb_publishable_` key and rejects service-role/secret keys. Supabase authenticates the key; the configuration check is an additional guard against accidental privileged access. A failed authenticated request never automatically retries without credentials. Hosted endpoints and credentials embedded in URLs are rejected in both modes.

No `OPENAI_API_KEY`, model selection, or paid opt-in is needed for the dashboard. Do not put a service-role credential in `SUPABASE_ANON_KEY`, and do not add `NEXT_PUBLIC_` prefixes. The separate ingestion command still needs its own privileged configuration and explicit paid approval when used live; keyless public reads do not grant ingestion privileges.

With the existing six seeded fixtures and no published real events, the connected home page is expected to be empty. `/sample` remains usable with no database credentials or database connection. The ingestion migration is not required for read-only dashboard access, but remains necessary before running ingestion.

## Public-read rules

- Read only `events`, using a fresh anonymous Supabase client with session storage disabled. Never query or join `event_sources` or `search_runs` from a page.
- Select only the columns needed to validate and render cards. Raw source evidence, diagnostics, internal timestamps, and scoring implementation metadata are not passed into the card model.
- Filter to `publication_status = published` and `is_fixture = false`. Row-level security independently prevents anonymous and authenticated readers from reading drafts or archives, and denies writes.
- Show in-person or hybrid events in New York, NY, US, using `America/New_York`, starting from the request time up to (but not including) 30 days later. Cancelled events are excluded. Already-started and past events are excluded.
- Rank saved networking scores highest first, with null scores last, then start time and stable ID. Zero is a valid score, not an unknown value.
- Display at most 50 events. A 51st row is used only to indicate that the list is capped. There is no pagination in this increment.
- Disable caching and automatic database retries. Each page load makes at most one database request, with an eight-second timeout. A new request sees database changes rather than a build-time snapshot.
- Validate returned rows and recheck visibility before creating public card objects. Malformed required fields produce a safe unavailable state. Blank optional text becomes unknown.

The fixture rows remain publicly readable under the existing database policy; they are explicitly excluded from the main application's query and defensive projection. `/sample` uses the original local fixture module, not those database rows.

## What the UI does and does not claim

Missing scores say “Not scored,” missing prices say “Price not listed,” and missing organizers/end times remain explicitly unknown. Known prices use integer minor units and their currency; only an explicit known zero is free. Blank recommendations do not become generated recommendations. Published events are not automatically considered newly discovered or independently verified.

The public `events.public_registration_url` field now carries only a selected canonical listing link, set through the separate [local review workflow](REVIEW-PUBLISH.md). The dashboard rejects noncanonical or unsupported URLs and never copies a link from private source records. Cards without an approved link still say “Registration link not available.” Sample cards never have links. Links open in a new tab with opener protection and no referrer. The public page has no publishing controls, admin interface, automatic scoring, or discovery scheduling.

## Verify

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:next
npm run test:next:runtime
npm run db:test:isolated
```

`test:next` checks the built sample HTML and confirms `/` is not prerendered. `test:next:runtime` starts a production Next.js server and a synthetic database HTTP server on temporary loopback ports. It tests fresh data, privacy, configuration, empty/error/recovery states, and loading-state streaming. It never uses the real database or a paid API, and closes both servers when finished. Run it from your regular Terminal if the sandbox blocks local listening ports.

The isolated database suite applies migrations and seeds to a disposable database and checks actual database permissions; it removes that database afterwards without modifying the normal one. See [the integration checkpoint](INTEGRATION-PROGRESS.md) for the verified results and environment limitations from this cycle.

## Next live-data step

Follow [the ingestion guide](INGESTION.md) only after choosing an API model, supplying credentials securely, and approving a separate small API budget. Verify three actual upcoming listings and repeat-run deduplication. Keep the imported events as drafts until their facts are reviewed and publication is explicitly authorized. This dashboard work is not evidence that the live ingestion gate has passed.
