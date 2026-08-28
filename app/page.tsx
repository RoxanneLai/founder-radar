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
import { rankEvents } from "@/lib/events";
import { mockEvents } from "@/lib/mock-events";

export default function Home() {
  const events = rankEvents(mockEvents);
  const newCount = events.filter((event) => event.isNew).length;
  const freeCount = events.filter((event) => event.priceUsd === 0).length;

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
            <span className="edition">V0 / PROTOTYPE</span>
          </div>
        </div>
      </header>
      <main className="page-shell">
        <div className="prototype-notice">
          <FlaskConical size={16} aria-hidden="true" />
          <p>
            <strong>A look at what’s possible.</strong> Fictional events, sample
            scores & availability. No live discovery or AI scoring yet.
          </p>
          <span className="demo-badge">DEMO DATA</span>
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
            <span className="eyebrow">THE SAMPLE EDITION</span>
            <p>September 1–6, 2026</p>
            <span>For founders, builders & the startup-curious.</span>
          </div>
        </section>
        <div className="summary-strip" aria-label="Sample shortlist summary">
          <div>
            <strong>{events.length.toString().padStart(2, "0")}</strong>
            <span>events on the radar</span>
          </div>
          <div>
            <strong>{newCount.toString().padStart(2, "0")}</strong>
            <span>marked new</span>
          </div>
          <div>
            <strong>{freeCount.toString().padStart(2, "0")}</strong>
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
                  Your shortlist<span>{events.length}</span>
                </h2>
                <p>A few promising rooms. A reason for every pick.</p>
              </div>
              <span className="sort-label">
                <ArrowDownWideNarrow size={15} aria-hidden="true" />
                Networking score ↓
              </span>
            </div>
            <ol className="event-list">
              {events.map((event, index) => (
                <li key={event.id}>
                  <EventCard event={event} rank={index + 1} />
                </li>
              ))}
            </ol>
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
              <p>Every card shows three different lenses, each out of 100.</p>
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
                V0 scores are hand-authored examples, not measured outcomes, AI
                results, or a calculated average.
              </p>
            </section>
            <section className="local-note">
              <MapPin size={18} aria-hidden="true" />
              <div>
                <h2>Built for New York.</h2>
                <p>
                  Neighborhoods matter. So does your time. All sample events are
                  in person, with times shown in New York’s time zone.
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
        <span>V0 · Static prototype · All listings are fictional</span>
      </footer>
    </>
  );
}
