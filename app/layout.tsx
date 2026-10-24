import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/site-nav";
import { currentBrand } from "./current-brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ask-a-Trend",
  description: "An AI trend scout for small fashion brands",
};

async function Nav() {
  const brand = await currentBrand();
  return <SiteNav ownBrand={brand?.id ?? null} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<div className="h-[57px] border-b border-zinc-200 dark:border-zinc-800" />}>
          <Nav />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
