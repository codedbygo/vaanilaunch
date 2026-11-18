import { useT } from "@/lib/i18n";

// The store on a phone. The iframe renders the real storefront at phone width. It is sandboxed
// without same-origin access, so the store page can never read this app's storage (where the
// owner's private key lives); ordering happens on the real store page, not in the preview.
export function PhonePreview({ src, version }: { src: string | null; version: string }) {
  const { t } = useT();
  return (
    <div className="grid justify-items-center gap-2">
      <div className="phone">
        <div className="phone-notch" />
        <div className="phone-screen">
          {src ? (
            <iframe
              key={version}
              src={src}
              title={t("preview.title")}
              sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            />
          ) : (
            <div
              className="grid h-full content-start gap-2.5 px-3.5 pt-10 pb-3.5"
              aria-label={t("preview.empty")}
            >
              <div className="shimmer h-36 animate-shimmer rounded-xl" />
              <div className="shimmer h-3.5 animate-shimmer rounded-xl" />
              <div className="shimmer h-3.5 w-3/5 animate-shimmer rounded-xl" />
              <div className="grid grid-cols-2 gap-2.5">
                <div className="shimmer h-36 animate-shimmer rounded-xl" />
                <div className="shimmer h-36 animate-shimmer rounded-xl" />
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">{t("preview.empty")}</p>
            </div>
          )}
        </div>
      </div>
      {src && <p className="text-center text-xs text-muted-foreground">{t("preview.note")}</p>}
    </div>
  );
}
