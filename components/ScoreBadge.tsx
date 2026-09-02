import { scoreTier } from "@/lib/events";

type ScoreBadgeProps = {
  score: number | null;
  label?: "Networking" | "Founder" | "Investor";
  prominent?: boolean;
};

export function ScoreBadge({
  score,
  label = "Networking",
  prominent = false,
}: ScoreBadgeProps) {
  return (
    <div
      className={
        prominent
          ? `score-badge score-${score === null ? "unknown" : scoreTier(score)}`
          : "score-inline"
      }
      aria-label={
        score === null
          ? `${label}: not scored`
          : `${label} score: ${score} out of 100`
      }
    >
      {prominent ? (
        <>
          <span className="score-value">
            {score ?? "—"}
            {score !== null && <span>/100</span>}
          </span>
          <span className="score-label">
            {score === null ? "Not scored" : label}
          </span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <strong>
            {score ?? "—"}
            <span className="sr-only">
              {score === null ? " not scored" : " out of 100"}
            </span>
          </strong>
        </>
      )}
    </div>
  );
}
