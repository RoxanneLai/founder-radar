import { connection } from "next/server";
import { Dashboard } from "@/components/Dashboard";
import { loadDashboard } from "@/lib/dashboard/repository";

export default async function Home() {
  // Runtime configuration and data must not be frozen into the production build.
  await connection();
  return <Dashboard result={await loadDashboard()} />;
}
