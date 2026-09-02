import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { getSampleEvents } from "@/lib/dashboard/sample";

export const metadata: Metadata = {
  title: "FounderRadar — Sample edition",
  description:
    "Six fictional NYC event listings with sample scores and availability. Not live events.",
  robots: { index: false, follow: false },
};

export default function SamplePage() {
  return (
    <Dashboard
      sample
      result={{ status: "ready", events: getSampleEvents(), hasMore: false }}
    />
  );
}
