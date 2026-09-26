import { Radio, RefreshCw } from "lucide-react";

export function ConnectionBadge({
  state,
}: {
  state: "connecting" | "live" | "reconnecting" | "local";
}) {
  const live = state === "live" || state === "local";
  const label = state === "local" ? "Local preview" : live ? "Live" : state === "connecting" ? "Connecting" : "Reconnecting";

  return (
    <span className={`connection-badge ${live ? "is-live" : "is-connecting"}`}>
      {live ? <Radio size={14} aria-hidden="true" /> : <RefreshCw className="spin" size={13} aria-hidden="true" />}
      {label}
    </span>
  );
}
