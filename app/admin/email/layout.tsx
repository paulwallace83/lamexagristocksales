import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  if (session.user.role !== "reviewer") {
    redirect("/qa/login");
  }

  const navLinks = [
    { href: "/qa", label: "Documents" },
    { href: "/review", label: "Import Review" },
    { href: "/admin/discount", label: "Discount" },
    { href: "/admin/requests", label: "Requests" },
    { href: "/admin/email", label: "Email" },
    { href: "/admin/agent", label: "AI Assistant" },
    { href: "/", label: "Public Site" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        portalName="Marketing Email"
        portalBadgeClass="bg-blue-500/80"
        navLinks={navLinks}
        currentPath="/admin/email"
        userEmail={session.user.email ?? ""}
      />
      <main>{children}</main>
    </div>
  );
}
