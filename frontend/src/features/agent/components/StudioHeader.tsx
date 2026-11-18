import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type StudioStatus = "live" | "wait" | "busy" | "listen" | "idle";

const STATUS_STYLE: Record<StudioStatus, string> = {
  live: "bg-success-soft text-success",
  wait: "animate-pulse bg-warning-soft text-warning",
  busy: "bg-accent text-accent-foreground",
  listen: "bg-rose/10 text-rose",
  idle: "bg-secondary text-muted-foreground",
};

interface Props {
  title: string;
  status: StudioStatus;
  statusLabel: string;
  timerMs: number | null;
  launched: boolean;
  onNewStore?: (() => void) | undefined;
}

export function StudioHeader({ title, status, statusLabel, timerMs, launched, onNewStore }: Props) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b bg-card px-5.5 py-4.5 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
        <span
          role="status"
          className={cn("rounded-full px-3 py-1 text-xs font-bold", STATUS_STYLE[status])}
        >
          {statusLabel}
        </span>
      </div>
      <div className="flex items-center gap-4.5">
        {onNewStore && (
          <Button
            variant="link"
            className="px-0 font-semibold text-accent-foreground"
            onClick={onNewStore}
          >
            {t("studio.newStore")}
          </Button>
        )}
        {timerMs !== null && (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-xs tracking-widest text-muted-foreground uppercase">
              {launched ? t("studio.launchedIn") : t("studio.launchTimer")}
            </span>
            <b
              className={cn(
                "text-2xl font-extrabold tabular-nums sm:text-3xl",
                launched && "text-success",
              )}
            >
              {formatDuration(timerMs)}
            </b>
          </div>
        )}
      </div>
    </div>
  );
}
