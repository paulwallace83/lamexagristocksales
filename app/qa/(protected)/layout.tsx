import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";
import { getPendingRequestCount } from "@/lib/document-requests";

export default async function QALayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  const isReviewer = session.user.role === "reviewer";
  const pendingCount = getPendingRequestCount();

  const navLinks = [
    { href: "/qa", label: "Documents" },
    ...(isReviewer
      ? [
          { href: "/review", label: "Import Review" },
          { href: "/admin/discount", label: "Discount" },
          { href: "/admin/email", label: "Email" },
        ]
      : []),
    { href: "/admin/requests", label: "Requests", badge: pendingCount },
    { href: "/admin/agent", label: "AI Assistant" },
    { href: "/", label: "Public Site" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        portalName="QA Portal"
        portalBadgeClass="bg-white/20"
        navLinks={navLinks}
        currentPath="/qa"
        userEmail={session.user.email ?? ""}
      />
      <main>{children}</main>
    </div>
  );
}
