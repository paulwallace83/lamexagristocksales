import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lamex Agri Stock Sales — Inventory",
  description: "Browse available processed fruit and vegetable inventory from Lamex Agri Stock Sales.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                L
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">Lamex Agri Stock Sales</h1>
                <p className="text-xs text-gray-500">Processed Fruit & Vegetable Inventory</p>
              </div>
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-sm font-medium text-gray-600 hover:text-green-700 transition-colors">
                Inventory
              </Link>
              <Link
                href="/contact"
                className="text-sm font-medium bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Request Quote
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-gray-500">
                &copy; {new Date().getFullYear()} Lamex Agri Stock Sales. All rights reserved.
              </div>
              <div className="flex gap-6">
                <Link href="/" className="text-sm text-gray-500 hover:text-green-700">Inventory</Link>
                <Link href="/contact" className="text-sm text-gray-500 hover:text-green-700">Contact</Link>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
