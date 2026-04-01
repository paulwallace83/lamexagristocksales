import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import { getPendingRequestCount } from "@/lib/document-requests";

export default async function RequestsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  if (!session.user.role || !["qa", "reviewer"].includes(session.user.role)) {
    redirect("/qa/login");
  }

  const pendingCount = getPendingRequestCount();

  const navLinks = [
    { href: "/qa", label: "Documents" },
    { href: "/review", label: "Import Review" },
    { href: "/admin/discount", label: "Discount" },
    { href: "/admin/requests", label: "Requests", badge: pendingCount },
    { href: "/admin/email", label: "Email" },
    { href: "/admin/agent", label: "AI Assistant" },
    { href: "/", label: "Public Site" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        portalName="Document Requests"
        portalBadgeClass="bg-emerald-500/80"
        navLinks={navLinks}
        currentPath="/admin/requests"
        userEmail={session.user.email ?? ""}
      />
      <main>{children}</main>
    </div>
  );
}
