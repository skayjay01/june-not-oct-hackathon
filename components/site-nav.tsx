"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// The header on every screen. It's about one brand: the one on screen (its page, its settings, or a
// question asked for it), else this browser's own. No brand yet → just the logo; home is the sign-up form.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function brandOnScreen(pathname: string, brandParam: string | null) {
  const fromPath = pathname.match(/^\/brands\/([^/]+)/)?.[1];
  const id = fromPath ?? (pathname === "/ask" ? brandParam : null);
  return id && UUID.test(id) ? id : null;
}

export function SiteNav({ ownBrand }: { ownBrand: string | null }) {
  const pathname = usePathname();
  const onScreen = brandOnScreen(pathname, useSearchParams().get("brand"));
  const brand = onScreen ?? ownBrand;

  const links = brand
    ? [
        { href: `/brands/${brand}`, label: "Your brand", active: pathname === `/brands/${brand}` },
        { href: onScreen && onScreen !== ownBrand ? `/ask?brand=${brand}` : "/ask", label: "Ask", active: pathname === "/ask" },
        { href: `/brands/${brand}/settings`, label: "Weights & settings", active: pathname === `/brands/${brand}/settings` },
      ]
    : [];

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
      </nav>
    </header>
  );
}
