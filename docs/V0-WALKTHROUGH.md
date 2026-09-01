# FounderRadar V0 — from zero to your first dashboard

> **Historical snapshot:** This guide records the original browser-based ChatGPT handoff for creating V0 from an empty folder. V0 is complete, the repository has moved to V1, and version numbers and setup details below may be stale. Use the root `README.md` and the checked-in source as the current authority.

## What we are building

One polished homepage showing six fictional NYC startup events ranked by networking score. No Supabase, LLM, discovery integration, authentication, or automation. The goal is to validate the product’s information hierarchy: is this event worth my time, why, and what is the tradeoff?

You can inspect the working Work version immediately, but follow the steps below to create your own local project and first Git commit. This guide does not assume you have a project, editor, Node, Git, or a Supabase account.

## 1. Install the basic tools

1. Install a code editor such as VS Code from https://code.visualstudio.com/.
2. Install Node.js 24 LTS from https://nodejs.org/. This includes npm. Use the installer for your operating system, then reopen your terminal.
3. Install Git from https://git-scm.com/downloads if it is not already available. On macOS, running `git --version` may offer to install Apple’s command-line tools; accept that installation and rerun the command afterward.
4. Open Terminal (macOS), or PowerShell/Windows Terminal on Windows.

Run:

```bash
node --version
npm --version
git --version
```

All three must return versions. Use Node 24 for this project. Next.js itself supports Node >=20.9, but our tests use Node’s built-in TypeScript support and this project requires >=22.13.

Official references: https://nextjs.org/docs/app/getting-started/installation and https://nextjs.org/docs/app/api-reference/cli/create-next-app.

## 2. Create the Next.js project

In the folder where you keep your projects, run:

```bash
npx create-next-app@16.2.6 founder-radar
```

Accept npm’s offer to install `create-next-app` if prompted. The version is pinned to the Next.js version tested for this V0; we can review framework upgrades separately.

If offered recommended defaults, choose **No, customize settings** so you can match the following options. The exact question order can vary.

| Setup option           | Choose         | Why                                                                  |
| ---------------------- | -------------- | -------------------------------------------------------------------- |
| TypeScript             | Yes            | Catches mismatched event fields before runtime                       |
| Linter                 | ESLint         | Checks code quality and Next.js conventions                          |
| React Compiler         | No             | Not needed for this static prototype                                 |
| Tailwind CSS           | Yes            | Provides styling utilities and responsive variants                   |
| `src/` directory       | No             | Matches the requested top-level `app/`, `components/`, `lib/` layout |
| App Router             | Yes            | Uses the modern Next.js `app/` structure                             |
| Customize import alias | No; keep `@/*` | Enables imports such as `@/lib/types`                                |
| Package manager        | npm            | Matches all commands in this guide                                   |

Then run:

```bash
cd founder-radar
npm run dev
```

Open http://localhost:3000 in your browser. You should see the default Next.js starter page. **Verify this before replacing files.** If your terminal reports another port, use that address instead. Press Control+C in the terminal to stop the server.

## 3. Add the complete V0 files

The supplied `founder-radar-v0.zip` contains a `founder-radar/` folder with complete files. Extract it somewhere separate, then copy the **contents** of that folder into the project you just created. Merge matching folders and replace the listed files. Do not put another `founder-radar/` folder inside your existing one.

The application files are also printed in full in `docs/V0-COMPLETE-CODE.md`; no snippets or omitted implementations. You can create each path in your editor and paste its complete contents instead.

| Path                                | Action / responsibility                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `app/page.tsx`                      | Replace starter homepage with the ranked dashboard              |
| `app/layout.tsx`                    | Replace with FounderRadar metadata and root layout              |
| `app/globals.css`                   | Replace with complete Tailwind and responsive styles            |
| `components/EventCard.tsx`          | Create the reusable event card                                  |
| `components/ScoreBadge.tsx`         | Create prominent and compact score displays                     |
| `lib/types.ts`                      | Create the typed event contract                                 |
| `lib/mock-events.ts`                | Create the clearly fictional event data                         |
| `lib/events.ts`                     | Create deterministic ranking and formatting helpers             |
| `public/favicon.svg`                | Create the FounderRadar icon                                    |
| `vendor/shadcn-tailwind-4.13.0.css` | Copy the included stylesheet dependency unchanged               |
| `package.json`                      | Replace with the download’s standard Next.js package definition |
| `package-lock.json`                 | Replace with the included locked dependency tree                |
| `tsconfig.json`                     | Replace with the included application TypeScript configuration  |
| `next.config.ts`                    | Replace with the included minimal Next.js configuration         |
| `postcss.config.mjs`                | Replace with the Tailwind PostCSS configuration                 |
| `eslint.config.mjs`                 | Replace with the included ESLint configuration                  |
| `.gitignore`                        | Copy the included ignore rules                                  |
| `tests/events.test.mjs`             | Create the deterministic logic tests                            |
| `tests/assert-dashboard.mjs`        | Create shared HTML assertions                                   |
| `tests/next-html.test.mjs`          | Create the production HTML test                                 |
| `.github/workflows/ci.yml`          | Create automatic checks for GitHub pushes/PRs                   |
| `README.md` and `docs/`             | Copy the product overview and walkthrough                       |

The vendor CSS is an inherited styling dependency, not a database or integration. Keep it because `globals.css` imports it. All code needed to run V0 is in the ZIP. Existing starter `public/next.svg` and `public/vercel.svg` can be deleted; the dashboard does not use them.

The download excludes credentials, `node_modules`, build outputs, and Work-only hosting code. **Never copy `.env` files or secrets into Git.** V0 needs no `.env` file.

Now install the dependencies declared by the supplied package:

```bash
npm ci
```

This includes Next.js, React, TypeScript, Tailwind, Lucide icons, styling dependencies, ESLint, and Prettier. The supplied `package-lock.json` pins the dependency tree. Keep and commit it; `npm ci` installs exactly that tree.

### Alternative: use the completed source directly

If you do not want to practice the setup wizard, extract the ZIP, open a terminal in its `founder-radar/` folder, and run `npm ci`. That folder is already a complete standard Next.js V0 project. Do not also run `create-next-app` inside it.

## 4. Run FounderRadar locally

From inside the project folder:

```bash
npm run dev:next
```

Open http://localhost:3000. The portable download also supports `npm run dev`; `dev:next` is used here because it works identically in the Work source checkout and the standard Next.js download.

Expected appearance: a cream-and-green FounderRadar dashboard, a conspicuous sample-data notice, six ranked cards, and a sidebar explaining the scores. On narrow screens the sidebar moves below the cards.

### Understand the code

- `StartupEvent` defines what a card needs, not how a provider discovers it.
- `mock-events.ts` is the only event data source. Data is deliberately unsorted so the ordering is demonstrably produced by code.
- `rankEvents()` makes a copy and sorts descending by `networkingScore`, then ascending by time and stable ID for ties.
- `EventCard` receives one event and rank; it does not fetch data or call an LLM.
- `ScoreBadge` presents a named score out of 100 without relying on color alone.
- `page.tsx` composes the data and components; counts are derived from fixtures.
- Times use explicit offsets and `America/New_York`, not the viewer’s local time zone.
- Scores and recommendation text are hand-authored. Networking score is not calculated as an average of the other two scores.
- “New,” “Almost full,” prices, and host/source details are fixed examples. No pretend registration button points to a real event.

This separation lets V1 replace the data source without rewriting the visual components. We are not implementing V1 now.

## 5. Run the automated checks

Open a second terminal in the same project, or stop the dev server with Control+C.

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build:next
npm run test:next
```

Expected results:

- Lint and TypeScript finish without errors.
- Six unit tests pass.
- Next.js reports a successful production build and a static `/` route.
- One HTML test passes, checking all six cards, score order, mock labels, optional downside handling, urgency states, metadata, and no real registration links.

`test:next` must run **after** `build:next`; it reads the generated HTML. These are not browser screenshot tests.

To test production serving, stop any dev server and run:

```bash
npm run start:next
```

Open http://localhost:3000 again. Stop with Control+C when finished.

## 6. Manually accept V0

Do not move to V1 until these checks work:

- The branding says FounderRadar, including the browser tab.
- The page explicitly says the events, scores, and availability are fictional.
- The six networking scores appear in this order: **94, 91, 86, 84, 80, 76**.
- Three cards show “New”; three events are free.
- Founder and investor scores are distinct from the prominent networking score.
- Every card shows an explanation, categories, source, price, date/time, and location.
- Five cards show a downside; the Brooklyn bootstrapping card omits that optional section cleanly.
- Open, almost-full, and waitlist states are visible.
- Times include EDT for this September sample; all use New York time.
- Resize to about 390px wide: no horizontal scrolling or clipped content; the sidebar appears below the events. Also check desktop width and 200% browser zoom.
- Press Tab: the skip link appears; activate it to move to the shortlist.
- No sample card claims to register you, save an event, or fetch live data.
- Browser developer console has no application errors.

A useful experiment: change the networking score of one fixture, reload, and check that it moves. Restore the fixture before committing, because the tests intentionally verify the approved sample order.

## 7. Make the first meaningful Git commit

`create-next-app` may already have initialized Git. Check:

```bash
git status
```

If it says this is not a Git repository:

```bash
git init
```

If you have never configured Git, set your own identity (replace these sample values):

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

Review before staging:

```bash
git status --short
git diff
```

Confirm there are no credentials, `.env` files, `node_modules`, or generated build files. Then:

```bash
git add app components lib public vendor tests docs .github README.md package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs .gitignore
git diff --cached --stat
git commit -m "feat: build FounderRadar V0 mock event dashboard"
git log -1 --oneline
```

This creates a local commit. It does not create a GitHub repository or upload code; we can do that separately after V0 is accepted.

## Troubleshooting

| Symptom                              | Check                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `node` or `npm` not found            | Install Node and reopen Terminal                                           |
| `package.json` not found             | Run commands inside the actual project folder                              |
| Import `@/…` fails                   | Keep the included `tsconfig.json` and top-level folders; do not add `src/` |
| Missing vendor CSS                   | Copy the included `vendor/` folder                                         |
| `test:next` cannot find `index.html` | Run `npm run build:next` first                                             |
| Port 3000 in use                     | Stop the other server, or run `npm run dev:next -- --port 3001`            |
| Native build fails after copying     | Run `npm ci`, then share the full first error                              |

## Stop here

V0 is the entire scope of this milestone. Share the first failing command/output if anything breaks. Once the local checks pass and the dashboard feels right, we can begin V1 deliberately.
