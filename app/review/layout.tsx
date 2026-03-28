import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminHeader from "@/components/AdminHeader";

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  if (session.user.role !== "reviewer") {
    redirect("/qa");
  }

  const navLinks = [
    { href: "/qa", label: "Documents" },
    { href: "/review", label: "Import Review" },
    { href: "/admin/discount", label: "Discount" },
    { href: "/admin/agent", label: "AI Assistant" },
    { href: "/", label: "Public Site" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        portalName="Import Review"
        portalBadgeClass="bg-amber-500/80"
        navLinks={navLinks}
        currentPath="/review"
        userEmail={session.user.email ?? ""}
      />
      <main>{children}</main>
    </div>
  );
}
