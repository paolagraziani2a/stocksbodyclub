import type { ComponentProps, ReactNode } from "react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const buttonBase =
  "btn inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm tracking-wide transition disabled:opacity-50 disabled:pointer-events-none";
export const buttonStyles = {
  primary: `${buttonBase} bg-ink text-ivory hover:bg-taupe-deep`,
  secondary: `${buttonBase} border border-line bg-white/60 hover:border-taupe`,
  ghost: `${buttonBase} hover:bg-sand`,
  danger: `${buttonBase} border border-danger/30 text-danger hover:bg-danger/5`,
};

export function Button({
  variant = "primary", className, ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button className={cn(buttonStyles[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-2xl border border-line bg-white/70 p-5 sm:p-6", className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <span className="text-xs uppercase tracking-[0.15em] text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-taupe focus:ring-2 focus:ring-blush";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputCls, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputCls, "appearance-none", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputCls, "min-h-24", className)} {...props} />;
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.15em] text-muted">{label}</span>
      <span className="font-serif text-3xl">{value}</span>
      {detail && <span className="text-xs leading-relaxed text-muted">{detail}</span>}
    </Card>
  );
}

const badgeTones = {
  neutral: "bg-sand text-ink",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  accent: "bg-blush text-taupe-deep",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs", badgeTones[tone])}>{children}</span>;
}

/** compact : peu de colonnes, tient sur un téléphone sans défilement horizontal. */
export function Table({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div className={compact ? "" : "-mx-5 overflow-x-auto sm:mx-0"}>
      <table
        className={cn(
          "w-full text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-3 [&_th]:pb-2 [&_th]:text-xs [&_th]:font-normal [&_th]:uppercase [&_th]:tracking-[0.12em] [&_th]:text-muted",
          compact ? "[&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-3 sm:[&_th]:px-3" : "min-w-[480px] [&_td]:px-3 [&_th]:px-3",
        )}
      >
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}
