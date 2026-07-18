import type { Metadata } from "next";
import Link from "next/link";
import { SubscribeForm } from "@/components/SubscribeForm";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "interbase — entry-level CS internships, updated daily",
    template: "%s — interbase",
  },
  description:
    "The freshest entry-level software internships and new-grad-friendly roles, scraped daily from official company job boards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-ink antialiased">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
            <Link href="/" className="text-lg font-extrabold tracking-tight">
              inter<span className="text-accent">base</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted">
              <Link href="/" className="hover:text-ink">Feed</Link>
              <Link href="/companies" className="hover:text-ink">Companies</Link>
              <Link href="/saved" className="hover:text-ink">Saved</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-12 border-t border-border bg-surface py-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-muted">
            <SubscribeForm />
            <p>interbase — entry-level CS internships, updated daily. Apply links go to official company job boards.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
