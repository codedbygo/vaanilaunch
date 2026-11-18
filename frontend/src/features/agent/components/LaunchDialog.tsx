import { useState } from "react";

import { manageUrl } from "@/app/stores/manage-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";

import { qrUrl } from "../api";
import type { ManageCreds } from "../schemas";
import { Confetti } from "./Confetti";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  name: string;
  launchMs: number | null;
  creds: ManageCreds | null;
}

export function LaunchDialog({ open, onOpenChange, url, name, launchMs, creds }: Props) {
  const [copied, setCopied] = useState(false);
  const { t } = useT();
  const store = name || t("launch.yourStore");
  const share = `https://wa.me/?text=${encodeURIComponent(t("launch.shareText", { store, url }))}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Confetti />}
      <DialogContent className="max-h-dvh animate-pop overflow-auto rounded-3xl text-center sm:max-w-md">
        <div className="text-5xl" aria-hidden="true">
          🎉
        </div>
        <DialogTitle className="text-2xl font-extrabold">
          {t("launch.title", { store })}
        </DialogTitle>
        <DialogDescription>
          {launchMs === null ? (
            t("launch.online")
          ) : (
            <>
              {t("launch.time")} <b className="text-lg text-success">{formatDuration(launchMs)}</b>
            </>
          )}
        </DialogDescription>
        <img
          className="launch-qr mx-auto rounded-2xl border p-2"
          src={qrUrl(url)}
          alt={t("launch.qrAlt", { url })}
        />
        <p className="text-sm text-muted-foreground">{t("launch.scan")}</p>
        <a
          className="text-sm font-semibold text-accent-foreground underline"
          href={qrUrl(url)}
          download="store-qr.svg"
        >
          ⬇ {t("launch.downloadQr")}
        </a>
        <a
          className="font-bold break-all text-accent-foreground underline"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {url}
        </a>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-full bg-brand text-white shadow-brand">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {t("launch.open")}
            </a>
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() =>
              void navigator.clipboard.writeText(url).then(() => {
                setCopied(true);
              })
            }
          >
            {copied ? t("launch.copied") : t("launch.copy")}
          </Button>
          <Button asChild className="rounded-full bg-whatsapp text-white">
            <a href={share} target="_blank" rel="noopener noreferrer">
              {t("launch.share")}
            </a>
          </Button>
        </div>
        {creds && (
          <p className="text-xs break-all text-muted-foreground">
            {t("launch.manageLink")} <code>{manageUrl(creds)}</code>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
