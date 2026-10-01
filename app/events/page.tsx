import type { Metadata } from "next";
import { connection } from "next/server";
import { Dashboard } from "@/components/Dashboard";
import { loadDashboard } from "@/lib/dashboard/repository";

export const metadata: Metadata = {
  title: "RightRoom — All events",
  description:
    "All reviewed, published NYC professional events, including the original startup-focused listings.",
};

export default async function AllEventsPage() {
  await connection();
  return <Dashboard result={await loadDashboard()} />;
}
