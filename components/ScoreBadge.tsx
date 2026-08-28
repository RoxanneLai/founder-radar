import { scoreTier } from "@/lib/events";

type ScoreBadgeProps = {
  score: number;
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
        prominent ? `score-badge score-${scoreTier(score)}` : "score-inline"
      }
      aria-label={`${label} score: ${score} out of 100`}
    >
      {prominent ? (
        <>
          <span className="score-value">
            {score}
            <span>/100</span>
          </span>
          <span className="score-label">{label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <strong>
            {score}
            <span className="sr-only"> out of 100</span>
          </strong>
        </>
      )}
    </div>
  );
}
