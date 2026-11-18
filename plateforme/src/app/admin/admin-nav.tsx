"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/planning", label: "Planning" },
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/produits", label: "Cartes & tarifs" },
  { href: "/admin/paiements", label: "Paiements & factures" },
  { href: "/admin/professeurs", label: "Professeurs" },
  { href: "/admin/apparence", label: "Site internet" },
  { href: "/admin/reglages", label: "Réglages" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((it) => {
        const active = it.href === "/admin" ? path === "/admin" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm transition lg:rounded-xl",
              active ? "bg-ink text-ivory" : "text-muted hover:bg-sand hover:text-ink",
            )}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
