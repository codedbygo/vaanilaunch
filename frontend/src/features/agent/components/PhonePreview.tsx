// The store on a phone. The iframe renders the real storefront at phone width.
export function PhonePreview({ src, version }: { src: string | null; version: string }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        {src ? (
          <iframe key={version} src={src} title="Store preview" />
        ) : (
          <div
            className="grid h-full content-start gap-2.5 px-3.5 pt-10 pb-3.5"
            aria-label="Your store will appear here"
          >
            <div className="shimmer h-36 animate-shimmer rounded-xl" />
            <div className="shimmer h-3.5 animate-shimmer rounded-xl" />
            <div className="shimmer h-3.5 w-3/5 animate-shimmer rounded-xl" />
            <div className="grid grid-cols-2 gap-2.5">
              <div className="shimmer h-36 animate-shimmer rounded-xl" />
              <div className="shimmer h-36 animate-shimmer rounded-xl" />
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Your store will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
