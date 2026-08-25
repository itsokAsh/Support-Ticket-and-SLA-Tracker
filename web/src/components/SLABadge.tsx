import { useState, useEffect } from "react";

interface SLABadgeProps {
  state: "ON_TRACK" | "AT_RISK" | "BREACHED";
  remainingMinutes: number;
  label: string;
}

/**
 * SLA Badge with live countdown.
 *
 * The backend is the single source of truth for SLA state.
 * This component only decrements the remaining minutes for display,
 * and never recalculates the actual SLA state.
 */
export default function SLABadge({ state, remainingMinutes, label }: SLABadgeProps) {
  const [displayMinutes, setDisplayMinutes] = useState(remainingMinutes);

  useEffect(() => {
    setDisplayMinutes(remainingMinutes);
  }, [remainingMinutes]);

  // Live countdown: decrement every 60 seconds
  useEffect(() => {
    if (state === "BREACHED" || displayMinutes <= 0) return;

    const interval = setInterval(() => {
      setDisplayMinutes((prev) => Math.max(0, prev - 1));
    }, 60000);

    return () => clearInterval(interval);
  }, [state, displayMinutes]);

  const stateClass = state.toLowerCase().replace("_", "-");
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;

  const timeDisplay =
    state === "BREACHED"
      ? "Breached"
      : displayMinutes === 0
        ? "Met"
        : `${hours}h ${mins}m`;

  return (
    <div className={`sla-badge sla-${stateClass}`}>
      <span className="sla-label">{label}</span>
      <span className="sla-time">{timeDisplay}</span>
    </div>
  );
}
