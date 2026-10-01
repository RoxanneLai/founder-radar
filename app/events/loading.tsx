import { Dashboard } from "@/components/Dashboard";

export default function Loading() {
  return (
    <Dashboard result={{ status: "loading", events: [], hasMore: false }} />
  );
}
