import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";

/**
 * Protected Layout — Wraps all authenticated pages.
 *
 * Desktop: Dark brown sidebar (fixed left, 256px) + beige content area
 * Mobile: Top header + scrollable content + bottom nav bar
 *
 * Auth is enforced by middleware.ts (cookie check).
 */
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-coco-beige">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile header */}
      <Header />

      {/* Main content area — offset by sidebar width on desktop */}
      <main className="md:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav — adds padding to prevent content overlap */}
      <div className="h-16 md:hidden" />
      <MobileNav />
    </div>
  );
}
