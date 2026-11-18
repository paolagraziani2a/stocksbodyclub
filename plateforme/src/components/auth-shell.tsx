import type { ReactNode } from "react";
import { Display, Label } from "./site";
import { cn } from "./ui";

/** Mise en page des écrans de compte : grand titre à gauche, formulaire à droite. */
export function AuthShell({ n, label, main, accent, intro, children, footer }: {
  n: string; label: string; main: string; accent: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-5 py-16 sm:px-8 md:grid-cols-2 md:py-24">
      <div>
        <Label n={n}>{label}</Label>
        <Display as="h1" main={main} accent={accent} className="mt-6" />
        {intro && <div className="mt-8 max-w-sm leading-relaxed text-muted">{intro}</div>}
      </div>
      <div className="md:pt-4">
        <div className="rounded-2xl border border-line bg-sand p-6 sm:p-8">{children}</div>
        {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}

const field = "w-full rounded-xl border border-line bg-ivory/60 px-4 py-3 text-[15px] outline-none transition focus:border-ink focus:bg-white";
export function AuthField({ label, hint, className, ...props }: React.ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <input className={field} {...props} />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Check({ name, children, defaultChecked, required }: { name: string; children: ReactNode; defaultChecked?: boolean; required?: boolean }) {
  return (
    <label className="flex items-start gap-3 text-sm leading-relaxed">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} required={required} className="mt-1 h-4 w-4 shrink-0 accent-[var(--ink)]" />
      <span>{children}</span>
    </label>
  );
}
