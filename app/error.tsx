"use client";

import Link from "next/link";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page-shell">
      <div className="feed-state" role="alert">
        <h1>We couldn’t show your shortlist.</h1>
        <p>Please try again. No private event details are shown here.</p>
        <div className="feed-actions">
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
          <Link href="/sample" prefetch={false}>
            Explore sample edition
          </Link>
        </div>
      </div>
    </main>
  );
}
