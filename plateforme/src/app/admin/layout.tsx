import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/lib/account-actions";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const profile = await requireAdmin();
  return (
    <div className="admin flex flex-1 flex-col lg:flex-row">
      <aside className="no-print border-b border-line bg-sand/60 px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
        <div className="mb-4 flex items-center justify-between lg:mb-10 lg:block">
          <Link href="/" className="text-xl font-medium tracking-tight">The Body Club</Link>
          <p className="hidden text-xs uppercase tracking-[0.2em] text-muted lg:mt-1 lg:block">Administration</p>
        </div>
        <AdminNav />
        <form action={signOut} className="mt-6 hidden lg:block">
          <p className="truncate px-4 text-xs text-muted">{profile.email}</p>
          <button className="px-4 py-2 text-sm text-muted hover:text-ink">Se déconnecter</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
    </div>
  );
}
