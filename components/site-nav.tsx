"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// The header on every screen. When the screen is about one brand (its page, its settings, or a
// question asked for it), it also links straight to that brand's settings.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentBrand(pathname: string, brandParam: string | null) {
  const fromPath = pathname.match(/^\/brands\/([^/]+)/)?.[1];
  const id = fromPath ?? (pathname === "/ask" ? brandParam : null);
  return id && UUID.test(id) ? id : null;
}

export function SiteNav() {
  const pathname = usePathname();
  const brand = currentBrand(pathname, useSearchParams().get("brand"));

  const links = [
    { href: "/", label: "Brands", active: pathname === "/" || (pathname.startsWith("/brands/") && !pathname.endsWith("/settings")) },
    { href: brand ? `/ask?brand=${brand}` : "/ask", label: "Ask", active: pathname === "/ask" },
    ...(brand ? [{ href: `/brands/${brand}/settings`, label: "Weights & settings", active: pathname === `/brands/${brand}/settings` }] : []),
    { href: "/sources", label: "Sources", active: pathname === "/sources" },
  ];

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <nav className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="mr-auto font-semibold tracking-tight">
          Ask-a-Trend
        </Link>
        {links.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            aria-current={l.active ? "page" : undefined}
            className={l.active ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}
          >
            {l.label}
          </Link>
        ))}
        <Link
          href="/onboard"
          className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add brand
        </Link>
      </nav>
    </header>
  );
}
