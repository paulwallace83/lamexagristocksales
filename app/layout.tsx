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
        <header className="bg-white border-b border-gray-200 shadow-sm">
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
              <Link
                href="/contact"
                className="text-sm font-medium bg-[#1a2b5f] text-white px-4 py-2 rounded-md hover:bg-[#4a90c4] transition-colors"
              >
                Request Quote
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="bg-[#1a2b5f] text-white mt-12">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex flex-col items-center md:items-start gap-3">
                <Image
                  src="/assets/logo-food-group.png"
                  alt="Lamex Food Group — 60 Years"
                  width={200}
                  height={70}
                  className="h-14 w-auto brightness-0 invert"
                />
                <p className="text-sm text-white/60">
                  &copy; {new Date().getFullYear()} Lamex Agri Foods. All rights reserved.
                </p>
              </div>
              <div className="flex gap-6">
                <Link href="/" className="text-sm text-white/70 hover:text-white transition-colors">Inventory</Link>
                <Link href="/contact" className="text-sm text-white/70 hover:text-white transition-colors">Contact</Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
