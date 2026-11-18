import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ManageCreds } from "@/features/agent/schemas";

import { useRotateKey } from "../hooks";
import type { Dashboard } from "../schemas";

/** Where order emails go, and a way to replace a private link that was shared by mistake. */
export function OwnerSettings({ creds, dash }: { creds: ManageCreds; dash: Dashboard }) {
  const rotate = useRotateKey(creds);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="grid gap-2 rounded-xl border border-dashed p-3 text-sm">
      <p>
        <b>Order emails: </b>
        {dash.owner_email ? (
          dash.owner_email_verified ? (
            <span>{dash.owner_email} (confirmed)</span>
          ) : (
            <span>
              {dash.owner_email} (waiting for you to click the link we emailed; until then orders go
              to the VaaniLaunch inbox)
            </span>
          )
        ) : (
          <span className="text-muted-foreground">
            not set. Tell the agent your email to get orders by mail.
          </span>
        )}
      </p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Your old link will stop working. Continue?</span>
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
            Yes, reset it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirming(false);
            }}
          >
            Cancel
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
          Reset my private link
        </Button>
      )}
    </div>
  );
}
