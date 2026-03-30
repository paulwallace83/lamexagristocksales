import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lamex Agri Foods — Stock Sales Inventory",
  description: "Browse available processed fruit and vegetable inventory from Lamex Agri Foods.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center">
              <Image
                src="/assets/logo-agri-foods.png"
                alt="Lamex Agri Foods"
                width={180}
                height={60}
                className="h-12 w-auto"
                priority
              />
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-sm font-medium text-[#1a2b5f] hover:text-[#4a90c4] transition-colors">
                Inventory
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="bg-[#1a2b5f] text-white mt-12">
          <div className="max-w-7xl mx-auto px-4 py-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Brand */}
              <div>
                <Image
                  src="/assets/logo-food-group.png"
                  alt="Lamex Food Group — 60 Years"
                  width={200}
                  height={70}
                  className="h-14 w-auto brightness-0 invert mb-3"
                />
                <p className="text-sm text-white/50 leading-relaxed">
                  Global sourcing of processed fruits and vegetables. Over 60 years serving the food industry.
                </p>
              </div>

              {/* Quick links */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Quick Links</h3>
                <div className="space-y-2">
                  <Link href="/" className="block text-sm text-white/70 hover:text-white transition-colors">Inventory</Link>
                  <Link href="/contact" className="block text-sm text-white/70 hover:text-white transition-colors">Request a Quote</Link>
                </div>
              </div>

              {/* Contact */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">Contact</h3>
                <div className="space-y-2 text-sm text-white/70">
                  <p>Lamex Agri Foods</p>
                  <p>
                    <a href="mailto:sales@lamexfoods.us" className="hover:text-white transition-colors">
                      sales@lamexfoods.us
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 mt-8 pt-6">
              <p className="text-xs text-white/40 text-center">
                &copy; {new Date().getFullYear()} Lamex Agri Foods. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
