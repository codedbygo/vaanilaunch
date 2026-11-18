import { ApiError } from "@/lib/api";
import type { MessageKey } from "@/lib/i18n";

/**
 * The message an owner sees for a failed call. Server `detail` text is English and meant for logs,
 * so the UI maps the status to a catalog message instead; anything unknown gets the generic one.
 */
export function errorKey(e: unknown): MessageKey {
  if (!(e instanceof ApiError)) return "error.generic";
  if (e.code === "network") return "error.network";
  switch (e.status) {
    case 429:
      return "error.tooMany";
    case 409:
      return "error.busy";
    case 428:
      return "error.reload";
    case 403:
      return "error.forbidden";
    case 400:
    case 413:
      return "error.badPhoto";
    default:
      return "error.generic";
  }
}
