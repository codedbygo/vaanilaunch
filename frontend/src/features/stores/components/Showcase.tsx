import { useStores } from "../hooks";

const safeHref = (u: string) => (/^https?:\/\//.test(u) || u.startsWith("/") ? u : "#");

// Gallery of live stores. Hidden while loading, on error, or when there are none yet:
// it is a showcase, not something the visitor needs.
export function Showcase() {
  const q = useStores();
  if (!q.data?.length) return null;
  return (
    <section id="stores" className="mx-auto max-w-6xl px-4 pt-16 sm:px-12 sm:pt-24">
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Stores launched with VaaniLaunch
      </h2>
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {q.data.map((s) => (
          <a
            key={s.slug}
            href={safeHref(s.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 rounded-2xl border-t-4 border-t-saffron bg-card p-3 no-underline shadow-soft transition-transform hover:-translate-y-1"
          >
            {s.image ? (
              <img
                src={s.image}
                alt=""
                width={76}
                height={76}
                loading="lazy"
                className="size-19 flex-none rounded-2xl object-cover"
              />
            ) : (
              <div className="grid size-19 flex-none place-items-center rounded-2xl bg-brand text-3xl font-extrabold text-white">
                {s.name?.[0] ?? "?"}
              </div>
            )}
            <div className="grid min-w-0 content-center">
              <b>{s.name}</b>
              <span className="text-sm text-muted-foreground">{s.tagline}</span>
              <small className="text-xs text-muted-foreground">
                {[s.city, s.languages?.filter(Boolean).join(" · ")].filter(Boolean).join(" — ")}
              </small>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
