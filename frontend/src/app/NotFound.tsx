import { Link } from "@tanstack/react-router";

import { useT } from "@/lib/i18n";

/** NotFound answers any path the route tree does not know. */
export function NotFound() {
  const { t } = useT();
  return (
    <section aria-labelledby="not-found-heading">
      <h1 id="not-found-heading" className="text-2xl font-semibold">
        {t("page.notFound")}
      </h1>
      <p className="mt-2 text-muted-foreground">
        <Link to="/" className="underline">
          {t("page.backHome")}
        </Link>
      </p>
    </section>
  );
}
