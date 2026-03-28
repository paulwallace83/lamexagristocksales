import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  if (session.user.role !== "qa" && session.user.role !== "reviewer") {
    redirect("/qa/login");
  }

  const isReviewer = session.user.role === "reviewer";

  const navLinks = [
    { href: "/qa", label: "Documents" },
    ...(isReviewer
      ? [
          { href: "/review", label: "Import Review" },
          { href: "/admin/discount", label: "Discount" },
          { href: "/admin/email", label: "Email" },
        ]
      : []),
    { href: "/admin/agent", label: "AI Assistant" },
    { href: "/", label: "Public Site" },
  ];

  return (
    <div className="fixed inset-0 bg-gray-50 flex flex-col z-[60]">
      <AdminHeader
        portalName="TDPAIB"
        portalBadgeClass="bg-indigo-500/80"
        navLinks={navLinks}
        currentPath="/admin/agent"
        userEmail={session.user.email ?? ""}
      />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
