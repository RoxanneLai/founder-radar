import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { getCareerSampleEvents } from "@/lib/career/sample";

export const metadata: Metadata = {
  title: "RightRoom — Career sample",
  description:
    "Fictional career-event examples. No live listings, registrations or personalized job predictions.",
  robots: { index: false, follow: false },
};

export default function CareerSamplePage() {
  return (
    <Dashboard
      sample
      career
      result={{
        status: "ready",
        events: getCareerSampleEvents(),
        hasMore: false,
      }}
    />
  );
}
