import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ManageCreds } from "@/features/agent/schemas";
import { useT } from "@/lib/i18n";

import { useRotateKey } from "../hooks";
import type { Dashboard } from "../schemas";

/** Where order emails go, and a way to replace a private link that was shared by mistake. */
export function OwnerSettings({ creds, dash }: { creds: ManageCreds; dash: Dashboard }) {
  const rotate = useRotateKey(creds);
  const [confirming, setConfirming] = useState(false);
  const { t } = useT();

  return (
    <div className="grid gap-2 rounded-xl border border-dashed p-3 text-sm">
      <p>
        <b>{t("owner.emails")} </b>
        {dash.owner_email ? (
          dash.owner_email_verified ? (
            <span>{t("owner.confirmed", { email: dash.owner_email })}</span>
          ) : (
            <span>{t("owner.unconfirmed", { email: dash.owner_email })}</span>
          )
        ) : (
          <span className="text-muted-foreground">{t("owner.notSet")}</span>
        )}
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>{t("owner.resetConfirm")}</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={rotate.isPending}
            onClick={() => {
              rotate.mutate(undefined, {
                onSettled: () => {
                  setConfirming(false);
                },
              });
            }}
          >
            {t("owner.resetYes")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirming(false);
            }}
          >
            {t("owner.cancel")}
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          onClick={() => {
            setConfirming(true);
          }}
        >
          {t("owner.reset")}
        </Button>
      )}
    </div>
  );
}
