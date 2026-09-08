import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  FlaskConical,
  MapPin,
  Radar,
  Sparkles,
} from "lucide-react";
import { EventCard } from "@/components/EventCard";
import type { DashboardResult } from "@/lib/dashboard/types";
import { DashboardState } from "@/components/DashboardState";

export function Dashboard({
  result,
  sample = false,
}: {
  result: DashboardResult | { status: "loading"; events: []; hasMore: false };
  sample?: boolean;
}) {
  const events = result.events;
  const newCount = events.filter((event) => event.isNew).length;
  const scoredCount = events.filter(
    (event) => event.networkingScore !== null,
  ).length;
  const freeCount = events.filter(
    (event) => event.priceAmountCents === 0 && event.currencyCode !== null,
  ).length;
  const countsKnown = result.status === "ready" || result.status === "empty";
  const count = (value: number) =>
    countsKnown ? value.toString().padStart(2, "0") : "—";

  return (
    <>
      <a className="skip-link" href="#picks">
        Skip to event picks
      </a>
      <header className="site-header">
        <div className="page-shell flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="brand" aria-label="FounderRadar home">
            <span className="brand-mark">
              <Radar size={25} strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span>
              Founder<span className="brand-light">Radar</span>
              <span className="brand-period">.</span>
            </span>
          </Link>
          <div className="header-location">
            <MapPin size={14} aria-hidden="true" />
            <span>New York City</span>
            <span className="header-separator" />
            <span className="edition">
              {sample ? "SAMPLE EDITION" : "PUBLISHED EDITION"}
            </span>
            <Link
              href={sample ? "/" : "/sample"}
              prefetch={false}
              className="edition-link"
            >
              {sample ? "Published events" : "View sample"}
            </Link>
          </div>
        </div>
      </header>
      <main className="page-shell">
        <div className="prototype-notice">
          {sample ? (
            <FlaskConical size={16} aria-hidden="true" />
          ) : (
            <Radar size={16} aria-hidden="true" />
          )}
          <p>
            {sample ? (
              <>
                <strong>A look at what’s possible.</strong> Fictional events,
                sample scores & availability. These are not live listings.
              </>
            ) : (
              <>
                <strong>Published listings only.</strong> Drafts and sample
                events stay out of this feed. Scores and prices appear only when
                available.
              </>
            )}
          </p>
          <span className="demo-badge">
            {sample ? "DEMO DATA" : "DATABASE FEED"}
          </span>
        </div>
        <section className="dashboard-intro" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">
              <span />
              THE NYC STARTUP SHORTLIST
            </p>
            <h1 id="page-title">
              Less noise.
              <br />
              <span>Better rooms.</span>
            </h1>
            <p className="intro-description">
              Don’t show me every startup event.
              <br className="sm:hidden" /> Show me the ones worth attending.
            </p>
          </div>
          <div className="edition-note">
            <span className="eyebrow">
              {sample ? "THE SAMPLE EDITION" : "THE UPCOMING EDITION"}
            </span>
            <p>{sample ? "September 1–6, 2026" : "The next 30 days"}</p>
            <span>For founders, builders & the startup-curious.</span>
          </div>
        </section>
        <div
          className="summary-strip"
          aria-label={
            sample ? "Sample shortlist summary" : "Published shortlist summary"
          }
        >
          <div>
            <strong>{count(events.length)}</strong>
            <span>events shown</span>
          </div>
          <div>
            <strong>{count(sample ? newCount : scoredCount)}</strong>
            <span>{sample ? "marked new" : "with networking scores"}</span>
          </div>
          <div>
            <strong>{count(freeCount)}</strong>
            <span>free to attend</span>
          </div>
          <p>
            <Sparkles size={15} aria-hidden="true" />
            Good connections start with the right room.
          </p>
        </div>
        <div className="dashboard-grid">
          <section
            id="picks"
            className="picks-section"
            aria-labelledby="picks-heading"
            tabIndex={-1}
          >
            <div className="section-heading">
              <div>
                <h2 id="picks-heading">
                  Your shortlist<span>{countsKnown ? events.length : "—"}</span>
                </h2>
                <p>
                  {sample
                    ? "A few promising rooms. A reason for every pick."
                    : "Upcoming NYC events. Unknown details stay unknown."}
                </p>
              </div>
              <span className="sort-label">
                <ArrowDownWideNarrow size={15} aria-hidden="true" />
                {sample ? "Networking score ↓" : "Score ↓ · unscored by date"}
              </span>
            </div>
            {result.status === "ready" ? (
              <>
                <ol className="event-list">
                  {events.map((event, index) => (
                    <li key={event.id}>
                      <EventCard event={event} rank={index + 1} />
                    </li>
                  ))}
                </ol>
                {result.hasMore && (
                  <p className="feed-limit">
                    Showing the top 50 events in the next 30 days.
                  </p>
                )}
              </>
            ) : (
              <DashboardState status={result.status} />
            )}
          </section>
          <aside className="sidebar" aria-label="About your shortlist">
            <section className="field-note">
              <span className="eyebrow">THE FOUNDERRADAR FILTER</span>
              <ArrowUpRight
                className="note-arrow"
                size={27}
                aria-hidden="true"
              />
              <h2>
                Worth your time.
                <br />
                Not just on
                <br />
                your calendar.
              </h2>
              <p>
                The best event isn’t always the biggest. It’s the one where you
                find your people.
              </p>
              <div className="note-bottom">
                <span>Fewer events. Better connections.</span>
                <Radar size={23} aria-hidden="true" />
              </div>
            </section>
            <section
              className="score-guide"
              aria-labelledby="score-guide-title"
            >
              <p className="eyebrow">READING THE SIGNAL</p>
              <h2 id="score-guide-title">What’s in a score?</h2>
              <p>
                {sample
                  ? "Every card shows three different lenses, each out of 100."
                  : "When available, scores offer three lenses, each out of 100. Unscored does not mean zero."}
              </p>
              <dl>
                <div>
                  <dt>Networking</dt>
                  <dd>
                    Room for meaningful conversations and useful connections.
                  </dd>
                </div>
                <div>
                  <dt>Founder</dt>
                  <dd>
                    Opportunity to meet people building and running startups.
                  </dd>
                </div>
                <div>
                  <dt>Investor</dt>
                  <dd>
                    Opportunity for direct, relevant investor conversations.
                  </dd>
                </div>
              </dl>
              <div className="score-legend">
                <p>
                  <span className="legend-dot exceptional" />
                  <strong>90–100</strong> Exceptional
                </p>
                <p>
                  <span className="legend-dot strong" />
                  <strong>80–89</strong> Strong
                </p>
                <p>
                  <span className="legend-dot promising" />
                  <strong>0–79</strong> Explore selectively
                </p>
              </div>
              <p className="guide-footnote">
                {sample
                  ? "Sample scores are hand-authored examples, not measured outcomes, AI results, or a calculated average."
                  : "Automated scoring is not enabled. This feed displays only saved scores and explanations; it never invents them."}
              </p>
            </section>
            <section className="local-note">
              <MapPin size={18} aria-hidden="true" />
              <div>
                <h2>Built for New York.</h2>
                <p>
                  Neighborhoods matter. So does your time.{" "}
                  {sample
                    ? "All sample events are in person"
                    : "In-person and hybrid NYC events"}
                  , with times shown in New York’s time zone.
                </p>
              </div>
            </section>
          </aside>
        </div>
      </main>
      <footer className="page-shell site-footer">
        <p>
          <Radar size={17} aria-hidden="true" />
          <strong>FounderRadar</strong>
          <span>Find your people.</span>
        </p>
        <span>
          {sample
            ? "Sample edition · All listings are fictional"
            : "Published edition · No automatic discovery on page load"}
        </span>
      </footer>
    </>
  );
}
