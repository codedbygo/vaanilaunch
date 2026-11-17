import { useState } from "react";

import { manageUrl } from "@/app/stores/manage-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDuration } from "@/lib/format";

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
  const store = name || "Your store";
  const share = `https://wa.me/?text=${encodeURIComponent(`${store} is now online! Order here: ${url}`)}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <Confetti />}
      <DialogContent className="max-h-dvh animate-pop overflow-auto rounded-3xl text-center sm:max-w-md">
        <div className="text-5xl" aria-hidden="true">
          🎉
        </div>
        <DialogTitle className="text-2xl font-extrabold">{store} is live!</DialogTitle>
        <DialogDescription>
          {launchMs === null ? (
            "Your store is online."
          ) : (
            <>
              From first words to a live store in{" "}
              <b className="text-lg text-success">{formatDuration(launchMs)}</b>
            </>
          )}
        </DialogDescription>
        <img
          className="launch-qr mx-auto rounded-2xl border p-2"
          src={qrUrl(url)}
          alt={`QR code for ${url}`}
        />
        <p className="text-sm text-muted-foreground">Scan to open the store on your phone</p>
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
              Open store
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
            {copied ? "Copied ✓" : "Copy link"}
          </Button>
          <Button asChild className="rounded-full bg-whatsapp text-white">
            <a href={share} target="_blank" rel="noopener noreferrer">
              Share on WhatsApp
            </a>
          </Button>
        </div>
        {creds && (
          <p className="text-xs break-all text-muted-foreground">
            Keep your private manage link: <code>{manageUrl(creds)}</code>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
