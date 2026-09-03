export const options = {
  from: "2026-09-01T00:00:00Z",
  to: "2026-09-15T00:00:00Z",
  limit: 3,
};
export const url = "https://luma.com/founder-test";
export const report = `Founder Test is an in-person startup founder meetup in New York, NY, US. September 5, 2026 at 6 PM EDT, ending at 8 PM EDT. Hosted by Test Org. Tickets are 12.50 USD; registration open. Source: ${url}.`;
export const fact = (value, quote = report) => ({
  value,
  quote: value === null ? null : quote,
});
export function candidate(sourceUrl = url) {
  return {
    source_url: sourceUrl,
    relevant_to_founders: fact(true),
    title: fact("Founder Test"),
    organizer_name: fact("Test Org"),
    starts_at: fact("2026-09-05T18:00:00-04:00"),
    ends_at: fact("2026-09-05T20:00:00-04:00"),
    time_zone: fact("America/New_York"),
    venue_name: fact(null),
    address_line: fact(null),
    city: fact("New York"),
    region: fact("NY"),
    country_code: fact("US"),
    event_format: fact("in-person"),
    price_amount_cents: fact(1250),
    currency_code: fact("USD"),
    registration_status: fact("open"),
  };
}

export function memoryRepository() {
  const runs = [];
  const sources = new Map();
  const events = new Map();
  return {
    runs,
    sources,
    events,
    async start(search) {
      const id = "run-" + (runs.length + 1);
      runs.push({ id, search });
      return id;
    },
    async checkpoint(id, metadata) {
      runs.find((run) => run.id === id).metadata = structuredClone(metadata);
    },
    async save(runId, source, event, time) {
      const old = sources.get(source.source_url);
      const record = old ?? {
        id: "source-" + sources.size,
        first_seen_at: time,
        discovered_by_run_id: runId,
        event_id: null,
      };
      record.last_seen_at = time;
      record.last_attempt_error = source.error_code ?? null;
      if (source.content_text && !source.error_code) {
        Object.assign(record, source, { fetched_at: time });
      }
      if (event) {
        record.event_id ??= "event-" + events.size;
        events.set(record.event_id, event);
      }
      sources.set(source.source_url, record);
      return {
        source_id: record.id,
        event_id: record.event_id,
        source_created: !old,
        event_written: Boolean(event),
      };
    },
    async finish(summary, metadata) {
      Object.assign(
        runs.find((run) => run.id === summary.run_id),
        {
          summary: structuredClone(summary),
          metadata: structuredClone(metadata),
        },
      );
    },
  };
}

export function fakeProvider(candidates = [candidate()], urls = [url]) {
  return {
    async research() {
      return { report, urls, metadata: { response_id: "research-test" } };
    },
    async extract() {
      return { candidates, metadata: { response_id: "extraction-test" } };
    },
  };
}
