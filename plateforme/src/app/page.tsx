export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-xs uppercase tracking-[0.35em] text-muted">Studio de Lagree</p>
      <h1 className="mt-6 text-5xl sm:text-6xl">The Body Club</h1>
      <p className="mt-6 max-w-sm font-light leading-relaxed text-muted">
        Réservez votre prochain cours en quelques secondes.
      </p>
      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <a
          href="/planning"
          className="rounded-full bg-ink px-8 py-3 text-sm tracking-wide text-ivory transition hover:bg-taupe-deep"
        >
          Voir le planning
        </a>
        <a
          href="/tarifs"
          className="rounded-full border border-line px-8 py-3 text-sm tracking-wide transition hover:border-taupe"
        >
          Les cartes
        </a>
      </div>
    </main>
  );
}
