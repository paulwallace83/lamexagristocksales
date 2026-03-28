import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/qa/login");
  }

  if (session.user.role !== "reviewer") {
    redirect("/qa");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#1a2b5f] text-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="/assets/logo-agri-foods.png"
              alt="Lamex Agri Foods"
              width={140}
              height={46}
              className="h-10 w-auto brightness-0 invert"
            />
            <span className="text-sm font-medium bg-amber-500/80 px-2 py-1 rounded">Import Review</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{session.user.email}</span>
            <Link href="/" className="text-sm text-white/70 hover:text-white">Public Site</Link>
            <form
              action={async () => {
                "use server";
                const { signOut } = await import("@/lib/auth");
                await signOut({ redirectTo: "/qa/login" });
              }}
            >
              <button type="submit" className="text-sm text-white/70 hover:text-white">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
