"use client";

import { FeedError } from "@/components/FeedError";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <FeedError retry={retry} />;
}
