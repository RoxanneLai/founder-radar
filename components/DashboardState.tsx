import Link from "next/link";
import type { DashboardResult } from "@/lib/dashboard/types";

const messages = {
  loading: {
    title: "Loading your shortlist",
    description:
      "Checking for published NYC events. This will only take a moment.",
  },
  empty: {
    title: "No published events yet",
    description:
      "There are no published NYC events starting in the next 30 days. Discovered drafts stay private until they are explicitly published.",
  },
  unconfigured: {
    title: "The event feed is not connected yet",
    description:
      "Connect the local database to see published events here. You can still explore the clearly labeled sample edition.",
  },
  unavailable: {
    title: "The event feed is temporarily unavailable",
    description:
      "We couldn’t load published events. No sample events have been substituted. Please try again shortly.",
  },
} as const;

export function DashboardState({
  status,
  career = false,
}: {
  status: Exclude<DashboardResult["status"], "ready"> | "loading";
  career?: boolean;
}) {
  const message = messages[status];
  return (
    <div
      className="feed-state"
      role="status"
      aria-live="polite"
      aria-busy={status === "loading"}
    >
      <span className="eyebrow">
        {status === "loading" ? "CHECKING THE ROOMS" : "PUBLISHED EVENT FEED"}
      </span>
      <h3>
        {career && status === "empty"
          ? "No published career events yet"
          : message.title}
      </h3>
      <p>
        {career && status === "empty"
          ? "There are no published career events starting in the next 30 days. Other published events may be available in All events; discovered drafts stay private until explicitly published."
          : message.description}
      </p>
      {status !== "loading" && (
        <div className="feed-actions">
          {status === "unavailable" && (
            <form action={career ? "/" : "/events"} method="get">
              <button type="submit">Try again</button>
            </form>
          )}
          <Link href={career ? "/sample/career" : "/sample"} prefetch={false}>
            Explore sample edition
          </Link>
          {career && status === "empty" && (
            <Link href="/events" prefetch={false}>
              Browse all published events
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
