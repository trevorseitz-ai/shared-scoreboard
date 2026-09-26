"use client";

import { type FormEvent, useRef, useState } from "react";
import { Gamepad2, LoaderCircle, Minus, Plus, Undo2 } from "lucide-react";
import { announceLocalUpdate, apiRequest } from "@/lib/client-api";
import type { GameSide, PublicGameState } from "@/lib/game-types";

export function HostScoreControl({
  game,
  hostToken,
  side,
  onGameChange,
}: {
  game: PublicGameState;
  hostToken: string;
  side: GameSide;
  onGameChange: (game: PublicGameState) => void;
}) {
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<
    "add" | "subtract" | "undo" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const name = side === 1 ? game.sideOneName : game.sideTwoName;
  const inputId = `host-point-amount-${side}`;
  const helperId = `host-point-amount-helper-${side}`;
  const errorId = `host-score-action-error-${side}`;
  const disabled = pending !== null || game.status !== "active";
  const buttonAmount = Number(amount);
  const addButtonLabel =
    Number.isInteger(buttonAmount) && buttonAmount > 0
      ? `Add ${buttonAmount.toLocaleString()}`
      : "Add points";

  async function changeScore(operation: "add" | "subtract") {
    const parsedAmount = Number(amount);
    if (
      !Number.isInteger(parsedAmount) ||
      parsedAmount < 1 ||
      parsedAmount > 999_999
    ) {
      setActionError("Enter a whole number greater than zero.");
      inputRef.current?.focus();
      return;
    }

    setPending(operation);
    setActionError(null);
    try {
      const result = await apiRequest<{ game: PublicGameState }>(
        `/api/games/${game.code}/host-score`,
        {
          method: "POST",
          body: JSON.stringify({
            hostToken,
            side,
            amount: parsedAmount,
            operation,
            actionId: crypto.randomUUID(),
          }),
        },
      );
      onGameChange(result.game);
      announceLocalUpdate(result.game);
      setAmount("1");
      inputRef.current?.focus();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The score could not be changed.",
      );
    } finally {
      setPending(null);
    }
  }

  async function undoLastEntry() {
    setPending("undo");
    setActionError(null);
    try {
      const result = await apiRequest<{ game: PublicGameState }>(
        `/api/games/${game.code}/host-undo`,
        {
          method: "POST",
          body: JSON.stringify({
            hostToken,
            side,
            actionId: crypto.randomUUID(),
          }),
        },
      );
      onGameChange(result.game);
      announceLocalUpdate(result.game);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "The last entry could not be undone.",
      );
    } finally {
      setPending(null);
    }
  }

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void changeScore("add");
  }

  return (
    <article
      className={`scoring-panel host-scoring-panel host-side-${side}`}
    >
      <div className="control-identity">
        <span className="control-check">
          <Gamepad2 size={18} />
        </span>
        <div>
          <span>Score side {side}</span>
          <strong>{name}</strong>
        </div>
      </div>

      <form onSubmit={submitAdd} className="score-form">
        <div className="point-entry-heading">
          <label htmlFor={inputId}>Enter points</label>
          <span id={helperId}>Tap to type any amount</span>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="number"
          inputMode="numeric"
          pattern="[0-9]*"
          min="1"
          max="999999"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          disabled={disabled}
          aria-describedby={actionError ? `${helperId} ${errorId}` : helperId}
        />

        <button className="add-button" type="submit" disabled={disabled}>
          {pending === "add" ? (
            <LoaderCircle className="spin" size={34} />
          ) : (
            <Plus size={38} strokeWidth={2.7} />
          )}
          <span>{addButtonLabel}</span>
        </button>
      </form>

      <div className="correction-row">
        <button
          className="undo-button"
          type="button"
          onClick={undoLastEntry}
          disabled={disabled}
        >
          {pending === "undo" ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Undo2 size={18} />
          )}
          Undo
        </button>
        <button
          className="subtract-button"
          type="button"
          onClick={() => void changeScore("subtract")}
          disabled={disabled}
        >
          {pending === "subtract" ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Minus size={17} />
          )}
          Subtract
        </button>
      </div>

      {actionError ? (
        <p id={errorId} className="action-error" role="alert">
          {actionError}
        </p>
      ) : (
        <p className="action-hint">Undo reverses the last entry.</p>
      )}
    </article>
  );
}
