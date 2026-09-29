import type { Metadata } from "next";
import { connection } from "next/server";
import { Dashboard } from "@/components/Dashboard";
import { loadDashboard } from "@/lib/dashboard/repository";

export const metadata: Metadata = {
  title: "RightRoom — Career events",
  description:
    "Reviewed NYC professional events ranked by career fit, with reasons, unknowns and attendance cautions.",
};

export default async function CareerPage() {
  await connection();
  return <Dashboard career result={await loadDashboard({ career: true })} />;
}
