import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDocumentStatus } from "@/lib/documents";
import QADashboardClient from "./QADashboardClient";

export const dynamic = "force-dynamic";

export default async function QADashboard() {
  const session = await auth();
  if (!session?.user) redirect("/qa/login");
  if (session.user.role !== "qa" && session.user.role !== "reviewer") redirect("/qa/login");

  const statuses = getDocumentStatus();

  return <QADashboardClient statuses={statuses} />;
}
