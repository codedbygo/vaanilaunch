import { useState, type Ref } from "react";

import { useManageStore } from "@/app/stores/manage-store";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dashboard } from "@/features/manage/components/Dashboard";
import { useDashboard } from "@/features/manage/hooks";

import { EXAMPLES } from "../languages";
import { deriveMilestones } from "../milestones";
import type { LaunchSession } from "../useLaunchSession";
import { ChatPanel } from "./ChatPanel";
import { Composer } from "./Composer";
import { LaunchDialog } from "./LaunchDialog";
import { PhonePreview } from "./PhonePreview";
import { StudioHeader, type StudioStatus } from "./StudioHeader";
import { Timeline } from "./Timeline";
import { useClock } from "./useClock";

export function Studio({ session, ref }: { session: LaunchSession; ref: Ref<HTMLElement> }) {
  const { state, approve, send, setCelebrate } = session;
  const creds = useManageStore((s) => s.creds);
  const clear = useManageStore((s) => s.clear);
  const [tab, setTab] = useState("steps");
  const now = useClock(state.startedAt !== null && state.launchMs === null);

  // Manage mode: the owner came back with a saved link, or just launched in this tab.
  const managing = creds !== null && (state.live !== null || state.startedAt === null);
  const dash = useDashboard(creds, managing);
  const launchedHere = state.startedAt !== null;

  const d = dash.data;
  // The draft awaiting approval: made in this tab, or the owner's draft store after a reload.
  const draftView = state.live
    ? null
    : (state.draft ??
      (managing && d?.status === "draft"
        ? {
            slug: d.slug,
            previewUrl: `/s/${d.slug}?t=${encodeURIComponent(d.preview_token)}`,
            approved: false,
          }
        : null));
  const running = state.steps.filter((s) => s.status === "running").at(-1);
  const [status, statusLabel]: [StudioStatus, string] = state.live
    ? ["live", "● Live"]
    : draftView && !draftView.approved
      ? ["wait", "Waiting for your approval"]
      : state.busy
        ? ["busy", "Agent working"]
        : ["idle", managing ? "Ready for changes" : "Ready"];

  const phoneSrc =
    state.live?.url ?? draftView?.previewUrl ?? (managing && d?.status === "live" ? d.url : null);
  const timerMs = state.startedAt === null ? null : (state.launchMs ?? now - state.startedAt);

  const timeline = (
    <>
      <h3 className="mb-3 flex flex-wrap items-baseline gap-2 font-bold">
        Agent at work{" "}
        <small className="text-xs font-medium text-muted-foreground">
          every step is a real API call
        </small>
      </h3>
      <Timeline
        milestones={deriveMilestones({
          steps: state.steps,
          busy: state.busy,
          started: launchedHere,
          hasDraft: state.draft !== null,
          approved: state.draft?.approved ?? false,
          live: state.live !== null,
          modelLabel: state.modelLabel,
        })}
      />
      {state.live && (
        <div className="mt-1.5 grid justify-items-start gap-1.5 rounded-xl bg-success-soft p-3.5">
          <b>🎉 Live at</b>
          <a
            href={state.live.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold break-all text-success underline"
          >
            {state.live.url}
          </a>
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              setCelebrate(true);
            }}
          >
            Show QR code
          </Button>
        </div>
      )}
    </>
  );

  return (
    <section
      ref={ref}
      id="studio"
      aria-label="Launch studio"
      className="relative z-10 mx-auto -mt-10 max-w-7xl scroll-mt-20 px-3 sm:px-8"
    >
      <StudioHeader
        title={managing ? `Managing ${d?.name ?? creds.slug}` : "Launch studio"}
        status={status}
        statusLabel={statusLabel}
        timerMs={timerMs}
        launched={state.launchMs !== null}
        onNewStore={managing ? clear : undefined}
      />
      {/* Chat | timeline | phone. The phone column is fixed to the 300 px device frame plus padding. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-b-2xl bg-border shadow-soft md:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_360px]">
        <div className="flex min-w-0 flex-col bg-card p-4.5">
          <ChatPanel messages={state.messages} busy={state.busy} activity={running?.label} />
          <div className="flex gap-1.5 overflow-x-auto pt-2.5">
            {(managing ? EXAMPLES.manage : EXAMPLES.launch).map((e) => (
              <Button
                key={e}
                variant="outline"
                size="sm"
                disabled={state.busy}
                onClick={() => void send(e)}
                className="max-w-xs flex-none justify-start rounded-full border-dashed text-muted-foreground"
              >
                <span className="truncate">{e}</span>
              </Button>
            ))}
          </div>
          <Composer session={session} />
        </div>

        <div className="order-3 min-w-0 bg-card p-4.5 md:col-span-2 xl:order-none xl:col-span-1">
          {managing ? (
            launchedHere ? (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-3.5 w-full">
                  <TabsTrigger value="steps">Launch steps</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                </TabsList>
                <TabsContent value="steps">{timeline}</TabsContent>
                <TabsContent value="orders">
                  <Dashboard creds={creds} />
                </TabsContent>
              </Tabs>
            ) : (
              <Dashboard creds={creds} />
            )
          ) : (
            timeline
          )}
        </div>

        <div className="order-2 flex min-w-0 flex-col items-center gap-3.5 bg-card p-4.5 xl:order-none">
          <PhonePreview src={phoneSrc} version={String(state.previewVersion)} />
          {draftView &&
            (draftView.approved ? (
              <p role="status" className="font-bold text-success">
                Approved. Publishing…
              </p>
            ) : (
              <div className="grid w-full max-w-75 grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Button
                  onClick={() => void approve(draftView.slug)}
                  disabled={state.busy}
                  className="animate-glow rounded-full bg-brand font-bold text-white"
                >
                  ✅ Approve &amp; publish
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={state.busy}
                  onClick={() =>
                    document.querySelector<HTMLTextAreaElement>("#studio textarea")?.focus()
                  }
                >
                  ✏️ Change
                </Button>
                <a
                  href={draftView.previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 text-center text-sm text-muted-foreground underline"
                >
                  Open full preview ↗
                </a>
              </div>
            ))}
        </div>
      </div>
      {state.live && (
        <LaunchDialog
          open={state.celebrate}
          onOpenChange={setCelebrate}
          url={state.live.url}
          name={state.storeName}
          launchMs={state.launchMs}
          creds={creds}
        />
      )}
    </section>
  );
}
