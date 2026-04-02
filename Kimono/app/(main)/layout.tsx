import Link from "next/link";
import Logo from "@/components/Logo";

const navItems = [
  { href: "/home", label: "Home" },
  { href: "/search", label: "Search" },
  { href: "/popular", label: "Popular" },
  { href: "/favorites", label: "Favorites" },
  { href: "/discover", label: "Discover" },
  { href: "/admin", label: "Admin" },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="neo-shell">
      <header className="border-b-2 border-white bg-[#111111]">
        <div className="neo-wrap flex flex-col gap-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/home" className="inline-flex items-center gap-3">
            <Logo className="h-8 w-auto" />
            <span className="text-xs font-black uppercase tracking-[0.34em] text-[#888888]">Main system</span>
          </Link>
          <nav className="flex flex-wrap gap-3">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="neo-button">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}