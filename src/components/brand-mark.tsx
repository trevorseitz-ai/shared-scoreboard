import { Radio } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand-mark" aria-label="Shared Scoreboard">
      <span className="brand-icon" aria-hidden="true">
        <Radio size={compact ? 16 : 18} strokeWidth={2.5} />
      </span>
      <span className="brand-name">Shared Scoreboard</span>
    </div>
  );
}
