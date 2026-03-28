import Image from "next/image";
import Link from "next/link";

interface NavLink {
  href: string;
  label: string;
}

interface AdminHeaderProps {
  portalName: string;
  portalBadgeClass?: string;
  navLinks: NavLink[];
  currentPath: string;
  userEmail: string;
}

export default function AdminHeader({
  portalName,
  portalBadgeClass = "bg-white/20",
  navLinks,
  currentPath,
  userEmail,
}: AdminHeaderProps) {
  return (
    <header className="bg-[#1a2b5f] text-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-2.5">
        {/* Single row: Logo | Nav tabs | User */}
        <div className="flex items-center justify-between gap-4">
          {/* Logo + badge */}
          <div className="flex items-center gap-3 shrink-0">
            <Image
              src="/assets/logo-agri-foods.png"
              alt="Lamex Agri Foods"
              width={120}
              height={40}
              className="h-8 w-auto brightness-0 invert"
            />
            <span className={`hidden sm:inline text-xs font-medium ${portalBadgeClass} px-2 py-0.5 rounded whitespace-nowrap`}>
              {portalName}
            </span>
          </div>

          {/* Nav tabs — centered */}
          <nav className="flex items-center gap-0.5">
            {navLinks.map((link) => {
              const isActive = currentPath === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Divider + User section */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:block h-5 border-l border-white/20" />
            <div className="hidden md:flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-white/40 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-white/45 max-w-[160px] truncate">{userEmail}</span>
            </div>
            <form
              action={async () => {
                "use server";
                const { signOut } = await import("@/lib/auth");
                await signOut({ redirectTo: "/qa/login" });
              }}
            >
              <button
                type="submit"
                className="text-xs font-medium border border-white/25 rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/40 transition-colors"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}
