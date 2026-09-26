import type { PublicGameState } from "@/lib/game-types";

export function ScorePair({
  game,
  compact = false,
  controlledSide,
}: {
  game: PublicGameState;
  compact?: boolean;
  controlledSide?: 1 | 2;
}) {
  return (
    <div className={`score-pair ${compact ? "is-compact" : ""}`} aria-label={`${game.sideOneName} ${game.sideOneScore}, ${game.sideTwoName} ${game.sideTwoScore}`}>
      <section className={`score-side score-side-one ${controlledSide === 1 ? "is-controlled" : ""}`}>
        <div className="score-name-row">
          <span className="side-label">Side 1</span>
          {controlledSide === 1 ? <span className="you-tag">You</span> : null}
        </div>
        <h2>{game.sideOneName}</h2>
        <output className="score-number" aria-label={`${game.sideOneName} score`}>{game.sideOneScore}</output>
      </section>

      <div className="score-divider" aria-hidden="true"><span>VS</span></div>

      <section className={`score-side score-side-two ${controlledSide === 2 ? "is-controlled" : ""}`}>
        <div className="score-name-row">
          <span className="side-label">Side 2</span>
          {controlledSide === 2 ? <span className="you-tag">You</span> : null}
        </div>
        <h2>{game.sideTwoName}</h2>
        <output className="score-number" aria-label={`${game.sideTwoName} score`}>{game.sideTwoScore}</output>
      </section>
    </div>
  );
}
