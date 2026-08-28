# FounderRadar V0 — complete source

All application and local setup files are included below in full. This package uses standard Next.js; Work hosting infrastructure is intentionally omitted. Follow `V0-WALKTHROUGH.md` in order. No API keys are required.

## `package.json`

```json
{
  "name": "founder-radar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start",
    "dev:next": "next dev",
    "build:next": "next build --webpack",
    "start:next": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "npm run test:unit",
    "test:unit": "node --experimental-strip-types --test tests/events.test.mjs",
    "test:next": "node --test tests/next-html.test.mjs",
    "format": "prettier --write app components lib tests docs README.md"
  },
  "dependencies": {
    "next": "16.2.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "lucide-react": "1.31.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.2.1",
    "@types/node": "22.19.19",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "eslint": "9.39.4",
    "eslint-config-next": "16.2.6",
    "prettier": "3.9.6",
    "tailwindcss": "4.2.1",
    "tw-animate-css": "1.4.0",
    "typescript": "5.9.3"
  }
}
```

## `app/page.tsx`

```tsx
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
```

## `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FounderRadar",
  description:
    "Don’t show me every startup event. Show me the ones worth attending. A fictional NYC event shortlist demonstrating FounderRadar’s V0 product experience.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

## `app/globals.css`

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../vendor/shadcn-tailwind-4.13.0.css";

@utility scrollbar-thin {
  scrollbar-width: thin;
}

@utility scrollbar-none {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

@utility scrollbar-gutter-stable {
  scrollbar-gutter: stable;
}

:root {
  --background: #ffffff;
  --foreground: #171717;
  --card: #ffffff;
  --card-foreground: #171717;
  --popover: #ffffff;
  --popover-foreground: #171717;
  --primary: #171717;
  --primary-foreground: #fafafa;
  --secondary: #f5f5f5;
  --secondary-foreground: #171717;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --accent: #f5f5f5;
  --accent-foreground: #171717;
  --destructive: #e7000b;
  --border: #e5e5e5;
  --input: #e5e5e5;
  --ring: #a1a1a1;
  --chart-1: #f54900;
  --chart-2: #009689;
  --chart-3: #104e64;
  --chart-4: #ffb900;
  --chart-5: #fe9a00;
  --radius: 0.625rem;
  --sidebar: #fafafa;
  --sidebar-foreground: #171717;
  --sidebar-primary: #171717;
  --sidebar-primary-foreground: #fafafa;
  --sidebar-accent: #f5f5f5;
  --sidebar-accent-foreground: #171717;
  --sidebar-border: #e5e5e5;
  --sidebar-ring: #a1a1a1;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: Arial, Helvetica, sans-serif;
  --font-mono:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
    --card: #171717;
    --card-foreground: #ededed;
    --popover: #171717;
    --popover-foreground: #ededed;
    --primary: #ededed;
    --primary-foreground: #171717;
    --secondary: #262626;
    --secondary-foreground: #ededed;
    --muted: #262626;
    --muted-foreground: #a1a1a1;
    --accent: #262626;
    --accent-foreground: #ededed;
    --destructive: #ff6467;
    --border: #ffffff1a;
    --input: #ffffff26;
    --ring: #737373;
    --chart-1: #8e51ff;
    --chart-2: #00bc7d;
    --chart-3: #fe9a00;
    --chart-4: #ad46ff;
    --chart-5: #ff2056;
    --sidebar: #171717;
    --sidebar-foreground: #ededed;
    --sidebar-primary: #8e51ff;
    --sidebar-primary-foreground: #ededed;
    --sidebar-accent: #262626;
    --sidebar-accent-foreground: #ededed;
    --sidebar-border: #ffffff1a;
    --sidebar-ring: #737373;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}

/* FounderRadar: warm paper, ink, forest green, and a small acid-green accent.
   System fonts keep this prototype independent of font services. */
:root {
  color-scheme: light;
  --background: #f6f6f1;
  --foreground: #263b35;
}
body {
  margin: 0;
  background: #f6f6f1;
  color: #263b35;
  font-family: Arial, Helvetica, sans-serif;
}
::selection {
  background: #dceaa5;
  color: #213c34;
}
a {
  color: inherit;
}
a:focus-visible {
  outline: 3px solid #567128;
  outline-offset: 5px;
  border-radius: 3px;
}
.page-shell {
  width: min(1200px, calc(100% - 80px));
  margin-inline: auto;
}
.site-header {
  border-bottom: 1px solid #dcded5;
  background: #fafbf6;
  padding: 24px 0;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 23px;
  letter-spacing: -1px;
  font-weight: 700;
  text-decoration: none;
}
.brand-mark {
  display: grid;
  place-items: center;
  background: #244138;
  color: #e2eeb7;
  width: 39px;
  height: 39px;
  border-radius: 11px;
}
.brand-light {
  font-weight: 400;
}
.brand-period {
  color: #758742;
}
.header-location {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: #53625b;
}
.header-separator {
  height: 15px;
  border-left: 1px solid #d4d9cc;
  margin: 0 10px;
}
.edition {
  font-size: 10px;
  letter-spacing: 1.3px;
}
.prototype-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #efeee5;
  border: 1px solid #e2e2d5;
  border-radius: 6px;
  margin-top: 24px;
  padding: 11px 14px;
  font-size: 11px;
  line-height: 1.6;
  color: #63644e;
}
.prototype-notice > svg {
  flex-shrink: 0;
}
.prototype-notice strong {
  font-weight: 600;
}
.demo-badge {
  margin-left: auto;
  white-space: nowrap;
  font-size: 9px;
  letter-spacing: 1px;
  font-weight: 700;
}
.dashboard-intro {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  padding: 35px 0 30px;
}
.eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.7px;
  line-height: 1.5;
}
.dashboard-intro .eyebrow {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #596a50;
}
.dashboard-intro .eyebrow > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #697e32;
}
h1 {
  margin-top: 12px;
  font-size: clamp(40px, 4.6vw, 62px);
  line-height: 1.04;
  letter-spacing: -2.8px;
  font-weight: 500;
}
h1 > span {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  color: #577150;
  letter-spacing: -2px;
}
.intro-description {
  font-size: 13px;
  line-height: 1.8;
  color: #5b6861;
  margin-top: 15px;
}
.edition-note {
  text-align: right;
  padding-bottom: 3px;
}
.edition-note .eyebrow {
  justify-content: end;
  font-size: 9px;
}
.edition-note p {
  font-size: 17px;
  font-weight: 500;
  margin: 8px 0;
}
.edition-note > span:last-child {
  font-size: 11px;
  color: #6b746c;
}
.summary-strip {
  display: flex;
  align-items: center;
  gap: 27px;
  padding: 21px 0;
  border-block: 1px solid #daddd2;
}
.summary-strip > div {
  display: flex;
  align-items: baseline;
  gap: 9px;
}
.summary-strip strong {
  font-size: 23px;
  font-weight: 500;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
}
.summary-strip span {
  font-size: 11px;
  color: #69736a;
}
.summary-strip > p {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  color: #6f776b;
  font-size: 10px;
}
.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 288px;
  gap: 30px;
  padding: 33px 0 50px;
}
.picks-section {
  min-width: 0;
  scroll-margin-top: 20px;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.section-heading h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.6px;
}
.section-heading h2 span {
  font-size: 10px;
  background: #e4e8dc;
  border-radius: 4px;
  padding: 3px 6px;
  letter-spacing: 0;
}
.section-heading p {
  font-size: 11px;
  color: #707970;
  margin-top: 5px;
}
.sort-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
  color: #5c685f;
  font-size: 10px;
}
.event-list {
  display: grid;
  gap: 18px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.event-card {
  background: #fff;
  border: 1px solid #dce1d7;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 3px #273c3503;
}
.event-card-top {
  border-color: #98ae82;
  box-shadow: 0 0 0 2px #bdcea124;
}
.event-main {
  padding: 23px 25px 18px;
}
.event-rank {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  color: #75836b;
  margin-right: 4px;
}
.category {
  padding: 3px 7px;
  border-radius: 4px;
  color: #55694b;
  background: #eef1e8;
  font-size: 9px;
  line-height: 1.4;
  font-weight: 600;
}
.category-ai {
  background: #eceaf5;
  color: #685b8e;
}
.category-vc {
  background: #f5eedc;
  color: #876b30;
}
.category-product {
  background: #e9eff5;
  color: #526981;
}
.category-saas {
  background: #e7f1ed;
  color: #3f7664;
}
.category-pitch {
  background: #f6eae4;
  color: #9a6246;
}
.new-label {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #5c762d;
  font-size: 9px;
  font-weight: 600;
  margin-left: 3px;
}
.new-label > span {
  background: #728d36;
  width: 4px;
  height: 4px;
  border-radius: 50%;
}
.event-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 18px;
  margin: 13px 0 16px;
}
.event-heading > div:first-child {
  min-width: 0;
}
.event-heading h3 {
  font-size: 21px;
  line-height: 1.26;
  letter-spacing: -0.65px;
  font-weight: 500;
  text-wrap: balance;
}
.organizer {
  font-size: 10px;
  color: #788074;
  margin-top: 7px;
}
.score-badge {
  flex-shrink: 0;
  min-width: 76px;
  padding: 9px 8px;
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.score-exceptional {
  background: #eaf0dc;
  color: #3b572c;
}
.score-strong {
  background: #edf2e8;
  color: #526746;
}
.score-promising {
  background: #f3f0e7;
  color: #796843;
}
.score-value {
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -1.2px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.score-value > span {
  font-size: 9px;
  letter-spacing: 0;
  margin-left: 2px;
}
.score-label {
  font-size: 8px;
  letter-spacing: 0.2px;
}
.event-details {
  display: grid;
  gap: 8px;
  color: #657064;
  font-size: 11px;
  line-height: 1.5;
}
.event-details p {
  display: flex;
  align-items: start;
  gap: 7px;
}
.event-details svg {
  flex-shrink: 0;
  margin-top: 1px;
  color: #7c8675;
}
.recommendation {
  padding: 13px 15px;
  margin-top: 18px;
  background: #f4f6ef;
  border-radius: 5px;
}
.recommendation h4 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 600;
  color: #4d6842;
}
.recommendation h4 svg {
  flex-shrink: 0;
}
.recommendation p {
  font-size: 11px;
  line-height: 1.75;
  color: #5b6953;
  margin-top: 7px;
}
.downside {
  font-size: 10px;
  color: #777a70;
  line-height: 1.7;
  margin-top: 11px;
}
.downside > span {
  font-weight: 600;
  color: #737364;
  margin-right: 5px;
}
.event-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 17px;
}
.score-group,
.score-inline,
.event-cost {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #687463;
}
.score-inline strong {
  font-weight: 600;
  color: #3c5140;
}
.score-divider {
  height: 12px;
  border-left: 1px solid #dce1d5;
  margin: 0 6px;
}
.event-cost {
  gap: 5px;
}
.event-cost strong {
  font-size: 11px;
  color: #45583d;
}
.event-cost > span {
  color: #7d8177;
  margin-left: 6px;
}
.event-status-bar {
  border-top: 1px solid #edf0e8;
  background: #fcfdf9;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 25px;
  font-size: 9px;
  color: #7e8478;
}
.registration {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.registration > span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
}
.registration-open {
  color: #5d744d;
}
.registration-almost-full {
  color: #9f652b;
}
.registration-waitlist {
  color: #856a7c;
}
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding-top: 69px;
}
.field-note {
  position: relative;
  color: #e5eccc;
  background: #28483d;
  padding: 27px 24px 20px;
  border-radius: 9px;
}
.field-note .eyebrow {
  font-size: 8px;
  letter-spacing: 1.35px;
  color: #b8cca1;
}
.note-arrow {
  position: absolute;
  right: 21px;
  top: 53px;
  color: #b0c783;
}
.field-note h2 {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 32px;
  font-weight: 400;
  letter-spacing: -1.2px;
  line-height: 1.15;
  margin-top: 27px;
}
.field-note > p {
  color: #c1cfb6;
  font-size: 11px;
  line-height: 1.8;
  margin-top: 20px;
  max-width: 210px;
}
.note-bottom {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #57705b;
  margin-top: 25px;
  padding-top: 15px;
  font-size: 8px;
  color: #c7d6b0;
}
.score-guide {
  padding: 0 7px;
}
.score-guide > .eyebrow {
  font-size: 8px;
  color: #7b826f;
  letter-spacing: 1.4px;
}
.score-guide h2 {
  margin-top: 9px;
  font-size: 19px;
  font-weight: 500;
  letter-spacing: -0.5px;
}
.score-guide > p:not(.eyebrow) {
  color: #778070;
  font-size: 11px;
  line-height: 1.8;
  margin-top: 9px;
}
.score-guide dl {
  margin-top: 22px;
  display: grid;
  gap: 17px;
}
.score-guide dt {
  font-size: 11px;
  font-weight: 600;
}
.score-guide dd {
  color: #778070;
  font-size: 11px;
  line-height: 1.75;
  margin-top: 4px;
}
.score-legend {
  display: grid;
  gap: 9px;
  padding: 18px 0;
  margin-top: 20px;
  border-block: 1px solid #dce1d3;
}
.score-legend p {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 10px;
  color: #737d69;
}
.score-legend strong {
  width: 47px;
  font-weight: 500;
  color: #3e5339;
  font-variant-numeric: tabular-nums;
}
.legend-dot {
  width: 6px;
  height: 6px;
  border-radius: 2px;
}
.exceptional {
  background: #597443;
}
.strong {
  background: #9cab7e;
}
.promising {
  background: #c2b78d;
}
.score-guide > .guide-footnote {
  font-size: 10px !important;
}
.local-note {
  display: flex;
  gap: 10px;
  border-top: 1px solid #dce1d3;
  padding: 22px 7px 0;
}
.local-note > svg {
  flex-shrink: 0;
  color: #7b8b63;
}
.local-note h2 {
  font-size: 12px;
  font-weight: 500;
}
.local-note p {
  font-size: 10px;
  line-height: 1.9;
  color: #7a8273;
  margin-top: 7px;
}
.site-footer {
  border-top: 1px solid #dce1d3;
  padding-block: 23px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  color: #7e8576;
  font-size: 9px;
}
.site-footer p {
  display: flex;
  align-items: center;
  gap: 7px;
}
.site-footer strong {
  color: #5c6d51;
  font-weight: 500;
}
.site-footer p > span {
  margin-left: 7px;
}
.skip-link {
  position: absolute;
  left: 15px;
  top: -80px;
  z-index: 10;
  padding: 10px 16px;
  background: white;
  color: #244138;
}
.skip-link:focus {
  top: 12px;
}
@media (min-width: 1440px) {
  .page-shell {
    width: min(1280px, calc(100% - 120px));
  }
  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr) 310px;
    gap: 36px;
  }
}
@media (max-width: 1000px) {
  .page-shell {
    width: calc(100% - 48px);
  }
  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr) 245px;
    gap: 22px;
  }
  .summary-strip > p {
    display: none;
  }
  .field-note {
    padding-inline: 20px;
  }
  .field-note h2 {
    font-size: 29px;
  }
  .event-main {
    padding-inline: 20px;
  }
  .event-heading h3 {
    font-size: 19px;
  }
  .section-heading {
    flex-wrap: wrap;
  }
  .sidebar {
    padding-top: 81px;
  }
}
@media (max-width: 760px) {
  .dashboard-grid {
    grid-template-columns: minmax(0, 1fr);
    padding-top: 26px;
  }
  .sidebar {
    padding-top: 5px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }
  .local-note {
    grid-column: 1 / -1;
  }
  .edition-note {
    display: none;
  }
  .summary-strip {
    justify-content: space-between;
    gap: 10px;
  }
  .summary-strip > div {
    flex-direction: column;
    gap: 3px;
  }
  .section-heading {
    flex-wrap: nowrap;
  }
  .event-main {
    padding: 20px;
  }
  .event-heading h3 {
    font-size: 21px;
  }
}
@media (max-width: 480px) {
  .page-shell {
    width: calc(100% - 32px);
  }
  .site-header {
    padding: 17px 0;
  }
  .brand {
    font-size: 21px;
  }
  .brand-mark {
    width: 34px;
    height: 34px;
  }
  .header-location {
    font-size: 10px;
  }
  .header-separator,
  .edition,
  .demo-badge {
    display: none;
  }
  .prototype-notice {
    align-items: start;
    margin-top: 18px;
    font-size: 10px;
  }
  .prototype-notice svg {
    margin-top: 2px;
  }
  .dashboard-intro {
    padding: 28px 0;
  }
  h1 {
    font-size: 49px;
  }
  .intro-description {
    font-size: 12px;
  }
  .summary-strip span {
    font-size: 10px;
  }
  .section-heading {
    flex-wrap: wrap;
    gap: 10px;
  }
  .event-main {
    padding: 18px 16px 15px;
  }
  .event-heading {
    gap: 10px;
  }
  .event-heading h3 {
    font-size: 20px;
  }
  .score-badge {
    min-width: 65px;
    padding: 8px 6px;
  }
  .score-value {
    font-size: 25px;
  }
  .event-status-bar {
    padding-inline: 16px;
    font-size: 8px;
  }
  .event-footer {
    gap: 13px;
  }
  .sidebar {
    grid-template-columns: minmax(0, 1fr);
  }
  .field-note h2 {
    font-size: 34px;
  }
  .field-note > p {
    max-width: 270px;
  }
  .score-guide {
    padding: 4px;
  }
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
```

## `components/EventCard.tsx`

```tsx
import { CalendarDays, MapPin, Sparkles, Ticket, Users } from "lucide-react";
import { ScoreBadge } from "@/components/ScoreBadge";
import { formatEventSchedule, formatPrice } from "@/lib/events";
import type { StartupEvent } from "@/lib/types";

const registrationLabels = {
  open: "Registration open",
  "almost-full": "Almost full",
  waitlist: "Waitlist",
} as const;

export function EventCard({
  event,
  rank,
}: {
  event: StartupEvent;
  rank: number;
}) {
  return (
    <article
      className={`event-card ${rank === 1 ? "event-card-top" : ""}`}
      aria-labelledby={`title-${event.id}`}
    >
      <div className="event-main">
        <div className="flex flex-wrap items-center gap-2">
          <span className="event-rank">{String(rank).padStart(2, "0")}</span>
          {event.categories.map((category) => (
            <span
              key={category}
              className={`category category-${category.toLowerCase()}`}
            >
              {category}
            </span>
          ))}
          {event.isNew && (
            <span className="new-label">
              <span aria-hidden="true" />
              New
            </span>
          )}
        </div>
        <div className="event-heading">
          <div>
            <h3 id={`title-${event.id}`}>{event.title}</h3>
            <p className="organizer">Hosted by {event.organizer}</p>
          </div>
          <ScoreBadge score={event.networkingScore} prominent />
        </div>
        <div className="event-details">
          <p>
            <CalendarDays size={15} aria-hidden="true" />
            <time dateTime={event.startsAt}>{formatEventSchedule(event)}</time>
          </p>
          <p>
            <MapPin size={15} aria-hidden="true" />
            <span>
              {event.venue} · {event.neighborhood}, {event.borough}
            </span>
          </p>
        </div>
        <div className="recommendation">
          <h4>
            <Sparkles size={14} aria-hidden="true" />
            Why FounderRadar recommends it
          </h4>
          <p>{event.recommendation}</p>
        </div>
        {event.potentialDownside && (
          <p className="downside">
            <span>Potential downside</span> {event.potentialDownside}
          </p>
        )}
        <div className="event-footer">
          <div className="score-group">
            <Users size={14} aria-hidden="true" />
            <ScoreBadge score={event.founderScore} label="Founder" />
            <span className="score-divider" />
            <ScoreBadge score={event.investorScore} label="Investor" />
          </div>
          <div className="event-cost">
            <Ticket size={14} aria-hidden="true" />
            <strong>{formatPrice(event.priceUsd)}</strong>
            <span>via {event.source}</span>
          </div>
        </div>
      </div>
      <div className="event-status-bar">
        <span
          className={`registration registration-${event.registrationStatus}`}
        >
          <span aria-hidden="true" />
          {registrationLabels[event.registrationStatus]}
        </span>
        <span>Sample listing · no registration</span>
      </div>
    </article>
  );
}
```

## `components/ScoreBadge.tsx`

```tsx
import { scoreTier } from "@/lib/events";

type ScoreBadgeProps = {
  score: number;
  label?: "Networking" | "Founder" | "Investor";
  prominent?: boolean;
};

export function ScoreBadge({
  score,
  label = "Networking",
  prominent = false,
}: ScoreBadgeProps) {
  return (
    <div
      className={
        prominent ? `score-badge score-${scoreTier(score)}` : "score-inline"
      }
      aria-label={`${label} score: ${score} out of 100`}
    >
      {prominent ? (
        <>
          <span className="score-value">
            {score}
            <span>/100</span>
          </span>
          <span className="score-label">{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <strong>
            {score}
            <span className="sr-only"> out of 100</span>
          </strong>
        </>
      )}
    </div>
  );
}
```

## `lib/types.ts`

```typescript
export const EVENT_CATEGORIES = [
  "AI",
  "Founder",
  "VC",
  "Product",
  "SaaS",
  "Pitch",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export type RegistrationStatus = "open" | "almost-full" | "waitlist";

/** One event card. V0 fixtures only; no discovery or model output yet. */
export type StartupEvent = {
  id: string;
  title: string;
  organizer: string;
  startsAt: string; // ISO 8601 with explicit UTC offset
  endsAt: string;
  timeZone: "America/New_York";
  venue: string;
  neighborhood: string;
  borough: "Manhattan" | "Brooklyn" | "Queens" | "Bronx" | "Staten Island";
  categories: readonly EventCategory[];
  priceUsd: number; // 0 means free; all V0 prices are known
  source: "Luma" | "Meetup" | "Eventbrite" | "Organizer website";
  registrationStatus: RegistrationStatus;
  isNew: boolean; // Explicit fixture flag, not a live discovery signal
  founderScore: number; // Integer 0–100
  investorScore: number;
  networkingScore: number;
  recommendation: string;
  potentialDownside?: string;
};
```

## `lib/mock-events.ts`

```typescript
import type { StartupEvent } from "./types";

/** Fictional fixtures, deliberately unsorted. Never treat these as real listings. */
export const mockEvents: readonly StartupEvent[] = [
  {
    id: "mock-product-003",
    title: "Behind the product: zero to one",
    organizer: "Product People NYC",
    startsAt: "2026-09-03T18:00:00-04:00",
    endsAt: "2026-09-03T20:00:00-04:00",
    timeZone: "America/New_York",
    venue: "The Workshop",
    neighborhood: "Flatiron",
    borough: "Manhattan",
    categories: ["Product", "SaaS"],
    priceUsd: 15,
    source: "Meetup",
    registrationStatus: "open",
    isNew: false,
    founderScore: 78,
    investorScore: 42,
    networkingScore: 86,
    recommendation:
      "Small breakout groups pair early-stage product leads with founders. A strong room for swapping practical lessons and finding future collaborators.",
    potentialDownside: "More operator-focused than investor-focused.",
  },
  {
    id: "mock-ai-001",
    title: "AI builders & founders: after hours",
    organizer: "Build Club NYC",
    startsAt: "2026-09-01T18:30:00-04:00",
    endsAt: "2026-09-01T21:00:00-04:00",
    timeZone: "America/New_York",
    venue: "The Mercer Loft",
    neighborhood: "SoHo",
    borough: "Manhattan",
    categories: ["AI", "Founder"],
    priceUsd: 0,
    source: "Luma",
    registrationStatus: "almost-full",
    isNew: true,
    founderScore: 96,
    investorScore: 72,
    networkingScore: 94,
    recommendation:
      "A founder-heavy room with live demos and plenty of unstructured time. Ideal for meeting people actively building in AI, beyond the usual panel circuit.",
    potentialDownside:
      "Technical conversations may be less useful if you’re looking for general career advice.",
  },
  {
    id: "mock-pitch-005",
    title: "First checks: founder pitch night",
    organizer: "First Check Collective",
    startsAt: "2026-09-04T18:00:00-04:00",
    endsAt: "2026-09-04T20:30:00-04:00",
    timeZone: "America/New_York",
    venue: "Broadway Exchange",
    neighborhood: "NoMad",
    borough: "Manhattan",
    categories: ["Pitch", "VC", "Founder"],
    priceUsd: 30,
    source: "Eventbrite",
    registrationStatus: "waitlist",
    isNew: false,
    founderScore: 85,
    investorScore: 88,
    networkingScore: 80,
    recommendation:
      "Early-stage pitches followed by an investor Q&A and reception. Useful for learning how investors think and making a few focused introductions.",
    potentialDownside:
      "Most of the evening is seated; networking time is limited and entry is waitlisted.",
  },
  {
    id: "mock-vc-002",
    title: "Coffee, capital & candid conversations",
    organizer: "Seed Circle",
    startsAt: "2026-09-02T08:30:00-04:00",
    endsAt: "2026-09-02T10:00:00-04:00",
    timeZone: "America/New_York",
    venue: "Union House",
    neighborhood: "Union Square",
    borough: "Manhattan",
    categories: ["Founder", "VC"],
    priceUsd: 20,
    source: "Luma",
    registrationStatus: "almost-full",
    isNew: true,
    founderScore: 91,
    investorScore: 95,
    networkingScore: 91,
    recommendation:
      "An intimate breakfast format gives founders space for actual conversations with seed investors. Especially relevant if you’re preparing your first raise.",
    potentialDownside:
      "An early start, with a stronger fundraising focus than product or hiring.",
  },
  {
    id: "mock-saas-004",
    title: "Bootstrapped in Brooklyn",
    organizer: "Independent Founders Guild",
    startsAt: "2026-09-05T10:00:00-04:00",
    endsAt: "2026-09-05T12:00:00-04:00",
    timeZone: "America/New_York",
    venue: "Bridge Street Studio",
    neighborhood: "DUMBO",
    borough: "Brooklyn",
    categories: ["Founder", "SaaS"],
    priceUsd: 0,
    source: "Organizer website",
    registrationStatus: "open",
    isNew: true,
    founderScore: 93,
    investorScore: 28,
    networkingScore: 84,
    recommendation:
      "Peer-led conversations about first customers, pricing, and sustainable growth. A good fit for finding founder friends with similar day-to-day challenges.",
  },
  {
    id: "mock-ai-006",
    title: "Shipping AI: a Sunday demo session",
    organizer: "Weekend Builders",
    startsAt: "2026-09-06T14:00:00-04:00",
    endsAt: "2026-09-06T17:00:00-04:00",
    timeZone: "America/New_York",
    venue: "Northside Workroom",
    neighborhood: "Williamsburg",
    borough: "Brooklyn",
    categories: ["AI", "Product"],
    priceUsd: 0,
    source: "Meetup",
    registrationStatus: "open",
    isNew: false,
    founderScore: 70,
    investorScore: 20,
    networkingScore: 76,
    recommendation:
      "A hands-on crowd sharing work in progress. Worth considering for project feedback, potential collaborators, and a closer look at what people are shipping.",
    potentialDownside:
      "A mixed experience level and little direct access to investors.",
  },
];
```

## `lib/events.ts`

```typescript
import type { StartupEvent } from "./types";

/** Never mutate the source. Equal scores use date, then stable ID as tie-breakers. */
export function rankEvents(events: readonly StartupEvent[]): StartupEvent[] {
  return [...events].sort(
    (a, b) =>
      b.networkingScore - a.networkingScore ||
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.id.localeCompare(b.id, "en"),
  );
}

export function formatEventSchedule(event: StartupEvent): string {
  const date = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: event.timeZone,
  }).format(new Date(event.startsAt));
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timeZone,
  };
  const start = new Intl.DateTimeFormat("en-US", timeOptions).format(
    new Date(event.startsAt),
  );
  const end = new Intl.DateTimeFormat("en-US", {
    ...timeOptions,
    timeZoneName: "short",
  }).format(new Date(event.endsAt));
  return `${date} · ${start}–${end}`;
}

export function formatPrice(priceUsd: number): string {
  return priceUsd === 0
    ? "Free"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(priceUsd) ? 0 : 2,
      }).format(priceUsd);
}

export function scoreTier(
  score: number,
): "exceptional" | "strong" | "promising" {
  if (score >= 90) return "exceptional";
  if (score >= 80) return "strong";
  return "promising";
}
```

## `public/favicon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#203e37"/><g fill="none" stroke="#d9e9ae" stroke-width="1.7"><circle cx="20" cy="20" r="12"/><circle cx="20" cy="20" r="7"/><path d="M20 20 30 10"/></g><circle cx="20" cy="20" r="2" fill="#d9e9ae"/></svg>
```

## `vendor/shadcn-tailwind-4.13.0.css`

```css
@theme inline {
  @keyframes accordion-down {
    from {
      height: 0;
    }
    to {
      height: var(
        --radix-accordion-content-height,
        var(--accordion-panel-height, auto)
      );
    }
  }

  @keyframes accordion-up {
    from {
      height: var(
        --radix-accordion-content-height,
        var(--accordion-panel-height, auto)
      );
    }
    to {
      height: 0;
    }
  }
}

/* Custom variants */
@custom-variant data-open {
  &:where([data-state="open"]),
  &:where([data-open]:not([data-open="false"])) {
    @slot;
  }
}

@custom-variant data-closed {
  &:where([data-state="closed"]),
  &:where([data-closed]:not([data-closed="false"])) {
    @slot;
  }
}

@custom-variant data-checked {
  &:where([data-state="checked"]),
  &:where([data-checked]:not([data-checked="false"])) {
    @slot;
  }
}

@custom-variant data-unchecked {
  &:where([data-state="unchecked"]),
  &:where([data-unchecked]:not([data-unchecked="false"])) {
    @slot;
  }
}

@custom-variant data-selected {
  &:where([data-selected="true"]) {
    @slot;
  }
}

@custom-variant data-disabled {
  &:where([data-disabled="true"]),
  &:where([data-disabled]:not([data-disabled="false"])) {
    @slot;
  }
}

@custom-variant data-active {
  &:where([data-state="active"]),
  &:where([data-active]:not([data-active="false"])) {
    @slot;
  }
}

@custom-variant data-horizontal {
  &:where([data-orientation="horizontal"]) {
    @slot;
  }
}

@custom-variant data-vertical {
  &:where([data-orientation="vertical"]) {
    @slot;
  }
}

@utility no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

/* scroll-fade */
@property --scroll-fade-t {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-b {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-s {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-e {
  syntax: "<length-percentage>";
  inherits: false;
  initial-value: 0px;
}
@property --scroll-fade-mask {
  syntax: "*";
  inherits: false;
}

@theme inline {
  @keyframes scroll-fade-reveal-t {
    from {
      --scroll-fade-t: 0px;
    }
    to {
      --scroll-fade-t: var(--_scroll-fade-size-t, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
    }
  }
  @keyframes scroll-fade-reveal-b {
    from {
      --scroll-fade-b: var(--_scroll-fade-size-b, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
    }
    to {
      --scroll-fade-b: 0px;
    }
  }
  @keyframes scroll-fade-reveal-s {
    from {
      --scroll-fade-s: 0px;
    }
    to {
      --scroll-fade-s: var(--_scroll-fade-size-s, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
    }
  }
  @keyframes scroll-fade-reveal-e {
    from {
      --scroll-fade-e: var(--_scroll-fade-size-e, var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10))));
    }
    to {
      --scroll-fade-e: 0px;
    }
  }
}

@utility scroll-fade {
  --_scroll-fade-size-t: var(
    --scroll-fade-t-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --_scroll-fade-size-b: var(
    --scroll-fade-b-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-block: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--scroll-fade-t, 0px),
    #000 calc(100% - var(--scroll-fade-b, 0px)),
    transparent 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
  mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation:
      scroll-fade-reveal-t 1ms ease-in-out,
      scroll-fade-reveal-b 1ms ease-in-out;
    animation-timeline: scroll(self y), scroll(self y);
    animation-range:
      0 var(--scroll-fade-reveal, calc(var(--spacing) * 24)),
      calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-t: var(--_scroll-fade-size-t);
    --scroll-fade-b: var(--_scroll-fade-size-b);
  }
}

@utility scroll-fade-y {
  --_scroll-fade-size-t: var(
    --scroll-fade-t-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --_scroll-fade-size-b: var(
    --scroll-fade-b-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-block: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--scroll-fade-t, 0px),
    #000 calc(100% - var(--scroll-fade-b, 0px)),
    transparent 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
  mask-image: var(--scroll-fade-mask, var(--scroll-fade-block));
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation:
      scroll-fade-reveal-t 1ms ease-in-out,
      scroll-fade-reveal-b 1ms ease-in-out;
    animation-timeline: scroll(self y), scroll(self y);
    animation-range:
      0 var(--scroll-fade-reveal, calc(var(--spacing) * 24)),
      calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-t: var(--_scroll-fade-size-t);
    --scroll-fade-b: var(--_scroll-fade-size-b);
  }
}

@utility scroll-fade-x {
  --_scroll-fade-size-s: var(
    --scroll-fade-s-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --_scroll-fade-size-e: var(
    --scroll-fade-e-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-inline: linear-gradient(
    to right,
    transparent 0,
    #000 var(--scroll-fade-s, 0px),
    #000 calc(100% - var(--scroll-fade-e, 0px)),
    transparent 100%
  );
  &:where([dir="rtl"], [dir="rtl"] *) {
    --scroll-fade-inline: linear-gradient(
      to left,
      transparent 0,
      #000 var(--scroll-fade-s, 0px),
      #000 calc(100% - var(--scroll-fade-e, 0px)),
      transparent 100%
    );
  }
  -webkit-mask-image: var(--scroll-fade-mask, var(--scroll-fade-inline));
  mask-image: var(--scroll-fade-mask, var(--scroll-fade-inline));
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation:
      scroll-fade-reveal-s 1ms ease-in-out,
      scroll-fade-reveal-e 1ms ease-in-out;
    animation-timeline: scroll(self inline), scroll(self inline);
    animation-range:
      0 var(--scroll-fade-reveal, calc(var(--spacing) * 24)),
      calc(100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))) 100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-s: var(--_scroll-fade-size-s);
    --scroll-fade-e: var(--_scroll-fade-size-e);
  }
}

@utility scroll-fade-t {
  --_scroll-fade-size-t: var(
    --scroll-fade-t-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to bottom,
    transparent 0,
    #000 var(--scroll-fade-t, 0px),
    #000 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-t 1ms ease-in-out;
    animation-timeline: scroll(self y);
    animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-t: var(--_scroll-fade-size-t);
  }
}

@utility scroll-fade-b {
  --_scroll-fade-size-b: var(
    --scroll-fade-b-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to bottom,
    #000 0,
    #000 calc(100% - var(--scroll-fade-b, 0px)),
    transparent 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-b 1ms ease-in-out;
    animation-timeline: scroll(self y);
    animation-range: calc(
        100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))
      )
      100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-b: var(--_scroll-fade-size-b);
  }
}

@utility scroll-fade-l {
  --_scroll-fade-size-s: var(
    --scroll-fade-s-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to right,
    transparent 0,
    #000 var(--scroll-fade-s, 0px),
    #000 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-s 1ms ease-in-out;
    animation-timeline: scroll(self x);
    animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-s: var(--_scroll-fade-size-s);
  }
}

@utility scroll-fade-r {
  --_scroll-fade-size-e: var(
    --scroll-fade-e-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--scroll-fade-e, 0px)),
    transparent 100%
  );
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-e 1ms ease-in-out;
    animation-timeline: scroll(self x);
    animation-range: calc(
        100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))
      )
      100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-e: var(--_scroll-fade-size-e);
  }
}

@utility scroll-fade-s {
  --_scroll-fade-size-s: var(
    --scroll-fade-s-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to right,
    transparent 0,
    #000 var(--scroll-fade-s, 0px),
    #000 100%
  );
  &:where([dir="rtl"], [dir="rtl"] *) {
    --scroll-fade-mask: linear-gradient(
      to left,
      transparent 0,
      #000 var(--scroll-fade-s, 0px),
      #000 100%
    );
  }
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-s 1ms ease-in-out;
    animation-timeline: scroll(self inline);
    animation-range: 0 var(--scroll-fade-reveal, calc(var(--spacing) * 24));
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-s: var(--_scroll-fade-size-s);
  }
}

@utility scroll-fade-e {
  --_scroll-fade-size-e: var(
    --scroll-fade-e-size,
    var(--scroll-fade-size, min(12%, calc(var(--spacing) * 10)))
  );
  --scroll-fade-mask: linear-gradient(
    to right,
    #000 0,
    #000 calc(100% - var(--scroll-fade-e, 0px)),
    transparent 100%
  );
  &:where([dir="rtl"], [dir="rtl"] *) {
    --scroll-fade-mask: linear-gradient(
      to left,
      #000 0,
      #000 calc(100% - var(--scroll-fade-e, 0px)),
      transparent 100%
    );
  }
  -webkit-mask-image: var(--scroll-fade-mask);
  mask-image: var(--scroll-fade-mask);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;

  @supports (animation-timeline: scroll()) {
    animation: scroll-fade-reveal-e 1ms ease-in-out;
    animation-timeline: scroll(self inline);
    animation-range: calc(
        100% - var(--scroll-fade-reveal, calc(var(--spacing) * 24))
      )
      100%;
    animation-fill-mode: both;
  }

  @supports not (animation-timeline: scroll()) {
    --scroll-fade-e: var(--_scroll-fade-size-e);
  }
}

@utility scroll-fade-* {
  --scroll-fade-size: calc(var(--spacing) * --value(integer));
  --scroll-fade-size: --value([length], [percentage]);
}

@utility scroll-fade-t-* {
  --scroll-fade-t-size: calc(var(--spacing) * --value(integer));
  --scroll-fade-t-size: --value([length], [percentage]);
}

@utility scroll-fade-b-* {
  --scroll-fade-b-size: calc(var(--spacing) * --value(integer));
  --scroll-fade-b-size: --value([length], [percentage]);
}

@utility scroll-fade-s-* {
  --scroll-fade-s-size: calc(var(--spacing) * --value(integer));
  --scroll-fade-s-size: --value([length], [percentage]);
}

@utility scroll-fade-e-* {
  --scroll-fade-e-size: calc(var(--spacing) * --value(integer));
  --scroll-fade-e-size: --value([length], [percentage]);
}

@utility scroll-fade-none {
  --scroll-fade-mask: none;
}

/* shimmer */
@property --shimmer-angle {
  syntax: "<angle>";
  inherits: true;
  initial-value: 20deg;
}
@property --shimmer-image {
  syntax: "*";
  inherits: false;
}
@property --shimmer-text-fill {
  syntax: "*";
  inherits: false;
}

@theme inline {
  @keyframes tw-shimmer {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: 0 0;
    }
  }
}

@utility shimmer {
  --_spread: var(--shimmer-spread, calc(3ch + 40px));
  --_base: currentColor;
  --_highlight: var(
    --shimmer-color,
    oklch(from currentColor l c h / calc(alpha* 0.2))
  );

  background-image: var(
    --shimmer-image,
    linear-gradient(
      calc(90deg + var(--shimmer-angle)),
      var(--_base) calc(50% - var(--_spread)),
      color-mix(in oklch, var(--_highlight), var(--_base) 50%)
        calc(50% - var(--_spread) * 0.5),
      var(--_highlight) 50%,
      color-mix(in oklch, var(--_highlight), var(--_base) 50%)
        calc(50% + var(--_spread) * 0.5),
      var(--_base) calc(50% + var(--_spread))
    )
  );
  background-repeat: no-repeat;
  background-size: calc(200% + var(--_spread) * 2) 100%;
  background-position: 0 0;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: var(--shimmer-text-fill, transparent);
  animation: tw-shimmer var(--shimmer-duration, 2s) linear infinite;

  @variant dark {
    --_highlight: var(
      --shimmer-color,
      oklch(from currentColor max(0.8, calc(l + 0.4)) c h / calc(alpha + 0.4))
    );
  }

  &:where([dir="rtl"], [dir="rtl"] *) {
    animation-direction: reverse;
  }
}

@utility shimmer-once {
  animation-iteration-count: 1;
}

@utility shimmer-reverse {
  animation-direction: reverse;
}

@utility shimmer-none {
  --shimmer-image: none;
  --shimmer-text-fill: currentColor;
}

@utility shimmer-color-* {
  --shimmer-color: --value(--color, [color]);
  --shimmer-color: color-mix(
    in oklch,
    --value(--color, [color]) calc(--modifier(integer) * 1%),
    transparent
  );
}

@utility shimmer-duration-* {
  --shimmer-duration: calc(--value(integer) * 1ms);
}

@utility shimmer-spread-* {
  --shimmer-spread: calc(var(--spacing) * --value(integer));
  --shimmer-spread: --value([length], [percentage]);
}

@utility shimmer-angle-* {
  --shimmer-angle: calc(--value(integer) * 1deg);
}

@media (prefers-reduced-motion: reduce) {
  .shimmer {
    animation: none;
    background-image: none;
    -webkit-text-fill-color: currentColor;
  }
}
```

## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "lib/**/*.ts",
    "hooks/**/*.ts",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

## `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
```

## `postcss.config.mjs`

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

## `eslint.config.mjs`

```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
```

## `.gitignore`

```text
# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# dependencies
/node_modules
/.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
/coverage

# next.js
/.next/
/out/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (can opt-in for committing if needed)
.env*

# vercel
.vercel

# typescript
next-env.d.ts
/dist/
/.wrangler/
/.sites-runtime/
/outputs/
/work/

# TypeScript incremental build cache
*.tsbuildinfo
```

## `tests/events.test.mjs`

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import {
  rankEvents,
  formatEventSchedule,
  formatPrice,
  scoreTier,
} from "../lib/events.ts";
import { mockEvents } from "../lib/mock-events.ts";
import { EVENT_CATEGORIES } from "../lib/types.ts";

test("ranks by networking score without changing the input", () => {
  const originalIds = mockEvents.map((event) => event.id);
  const sorted = rankEvents(mockEvents);
  assert.deepEqual(
    sorted.map((event) => event.networkingScore),
    [94, 91, 86, 84, 80, 76],
  );
  assert.deepEqual(
    mockEvents.map((event) => event.id),
    originalIds,
  );
  assert.notEqual(sorted, mockEvents);
  assert.deepEqual(rankEvents([]), []);
});

test("breaks equal scores by start time and then stable ID", () => {
  const base = mockEvents[0];
  const later = { ...base, id: "b", startsAt: "2026-09-05T18:00:00-04:00" };
  const earlier = { ...base, id: "c", startsAt: "2026-09-01T18:00:00-04:00" };
  const sameTime = { ...earlier, id: "a" };
  assert.deepEqual(
    rankEvents([later, earlier, sameTime]).map((e) => e.id),
    ["a", "c", "b"],
  );
});

test("fixtures satisfy the V0 display contract", () => {
  assert.equal(new Set(mockEvents.map((e) => e.id)).size, mockEvents.length);
  for (const event of mockEvents) {
    assert.match(event.id, /^mock-/);
    for (const score of [
      event.networkingScore,
      event.founderScore,
      event.investorScore,
    ]) {
      assert.ok(Number.isInteger(score) && score >= 0 && score <= 100);
    }
    assert.ok(Number.isFinite(event.priceUsd) && event.priceUsd >= 0);
    assert.ok(Date.parse(event.endsAt) > Date.parse(event.startsAt));
    assert.match(event.startsAt, /[+-]\d{2}:\d{2}$/);
    assert.ok(event.categories.length > 0);
    assert.ok(event.categories.every((c) => EVENT_CATEGORIES.includes(c)));
    assert.ok(event.recommendation.length > 0);
  }
});

test("formats free and paid events without dropping cents", () => {
  assert.equal(formatPrice(0), "Free");
  assert.equal(formatPrice(20), "$20");
  assert.equal(formatPrice(12.5), "$12.50");
});

test("formats the event in New York time, including daylight saving time", () => {
  assert.equal(
    formatEventSchedule(mockEvents[1]),
    "Tue, Sep 1 · 6:30 PM–9:00 PM EDT",
  );
  assert.equal(
    formatEventSchedule({
      ...mockEvents[1],
      startsAt: "2026-12-01T18:30:00-05:00",
      endsAt: "2026-12-01T21:00:00-05:00",
    }),
    "Tue, Dec 1 · 6:30 PM–9:00 PM EST",
  );
});

test("score colors match the documented thresholds", () => {
  assert.equal(scoreTier(100), "exceptional");
  assert.equal(scoreTier(90), "exceptional");
  assert.equal(scoreTier(89), "strong");
  assert.equal(scoreTier(80), "strong");
  assert.equal(scoreTier(79), "promising");
  assert.equal(scoreTier(0), "promising");
});
```

## `tests/assert-dashboard.mjs`

```javascript
import assert from "node:assert/strict";

export function assertDashboardHtml(html) {
  assert.match(html, /<title>FounderRadar<\/title>/);
  assert.doesNotMatch(html, /codex-preview|Starter Project/);
  assert.match(html, /Fictional events, sample scores/);
  assert.match(html, /No live discovery or AI scoring yet/);
  assert.equal((html.match(/<article\b/g) ?? []).length, 6);
  assert.equal((html.match(/<h4[^>]*>/g) ?? []).length, 6);
  assert.equal((html.match(/class="downside"/g) ?? []).length, 5);
  const scores = [
    ...html.matchAll(/aria-label="Networking score: (\d+) out of 100"/g),
  ].map((m) => Number(m[1]));
  assert.deepEqual(scores, [94, 91, 86, 84, 80, 76]);
  assert.match(html, /Almost full/);
  assert.match(html, /Waitlist/);
  assert.match(html, /Registration open/);
  assert.match(html, /EDT/);
  assert.match(html, /href="#picks"/);
  assert.doesNotMatch(html, /<a[^>]+href="https?:/);
}
```

## `tests/next-html.test.mjs`

```javascript
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertDashboardHtml } from "./assert-dashboard.mjs";

test("the standard Next.js build renders the complete V0 dashboard", async () => {
  const html = await readFile(
    new URL("../.next/server/app/index.html", import.meta.url),
    "utf8",
  );
  assertDashboardHtml(html);
});
```

## `.github/workflows/ci.yml`

```yaml
name: V0 checks
on:
  push:
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:unit
      - run: npm run build:next
      - run: npm run test:next
```

