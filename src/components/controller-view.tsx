"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LoaderCircle,
  Minus,
  Plus,
  ShieldCheck,
  Undo2,
  Unplug,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ConnectionBadge } from "@/components/connection-badge";
import { ScorePair } from "@/components/score-pair";
import { announceLocalUpdate, apiRequest, ClientApiError } from "@/lib/client-api";
import type {
  ClaimedController,
  ControllerMemory,
  PublicGameState,
} from "@/lib/game-types";
import { useGameState } from "@/lib/use-game-state";

const CONTROLLER_STORAGE_PREFIX = "shared-scoreboard:controller:";

function readControllerMemory(invite: string): ControllerMemory | null {
  try {
    const raw = window.localStorage.getItem(`${CONTROLLER_STORAGE_PREFIX}${invite}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ControllerMemory>;
    if (!value.code || !value.sessionToken || (value.side !== 1 && value.side !== 2)) return null;
    return value as ControllerMemory;
  } catch {
    return null;
  }
}

function ActiveController({ memory }: { memory: ControllerMemory }) {
  const { game, setGame, loading, error, connection } = useGameState(memory.code);
  const [amount, setAmount] = useState("1");
  const [pending, setPending] = useState<"add" | "subtract" | "undo" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function changeScore(operation: "add" | "subtract", explicitAmount?: number) {
    const parsedAmount = explicitAmount ?? Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > 999_999) {
      setActionError("Enter a whole number greater than zero.");
      inputRef.current?.focus();
      return;
    }

    setPending(operation);
    setActionError(null);
    try {
      const result = await apiRequest<{ game: PublicGameState }>(`/api/games/${memory.code}/score`, {
        method: "POST",
        body: JSON.stringify({
          sessionToken: memory.sessionToken,
          amount: parsedAmount,
          operation,
          actionId: crypto.randomUUID(),
        }),
      });
      setGame(result.game);
      announceLocalUpdate(result.game);
      if (explicitAmount === undefined) setAmount("1");
      inputRef.current?.focus();
      return result.game;
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "The score could not be changed.",
      );
    } finally {
      setPending(null);
    }
  }

  async function undoLastEntry() {
    setPending("undo");
    setActionError(null);
    try {
      const result = await apiRequest<{ game: PublicGameState }>(`/api/games/${memory.code}/undo`, {
        method: "POST",
        body: JSON.stringify({ sessionToken: memory.sessionToken, actionId: crypto.randomUUID() }),
      });
      setGame(result.game);
      announceLocalUpdate(result.game);
      return result.game;
    } catch (requestError) {
      setActionError(
        requestError instanceof Error ? requestError.message : "The last entry could not be undone.",
      );
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    const pointSchema = {
      type: "object",
      properties: { amount: { type: "integer", minimum: 1, maximum: 999999 } },
      required: ["amount"],
      additionalProperties: false,
    };
    const validateAmount = (input: unknown) => {
      const amountValue = (input as { amount?: unknown })?.amount;
      if (!Number.isInteger(amountValue) || Number(amountValue) < 1 || Number(amountValue) > 999999) {
        throw new Error("Amount must be a whole number from 1 to 999999.");
      }
      return Number(amountValue);
    };
    const register = (tool: WebMcpTool) =>
      Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch((registrationError) =>
        console.warn(`Could not register ${tool.name}`, registrationError),
      );
    const toolChangeScore = async (operation: "add" | "subtract", input: unknown) => {
      const pointAmount = validateAmount(input);
      setPending(operation);
      setActionError(null);
      try {
        const result = await apiRequest<{ game: PublicGameState }>(`/api/games/${memory.code}/score`, {
          method: "POST",
          body: JSON.stringify({
            sessionToken: memory.sessionToken,
            amount: pointAmount,
            operation,
            actionId: crypto.randomUUID(),
          }),
        });
        setGame(result.game);
        announceLocalUpdate(result.game);
        return result.game;
      } catch (toolError) {
        setActionError(toolError instanceof Error ? toolError.message : "The score could not be changed.");
        throw toolError;
      } finally {
        setPending(null);
      }
    };
    const toolUndo = async () => {
      setPending("undo");
      setActionError(null);
      try {
        const result = await apiRequest<{ game: PublicGameState }>(`/api/games/${memory.code}/undo`, {
          method: "POST",
          body: JSON.stringify({ sessionToken: memory.sessionToken, actionId: crypto.randomUUID() }),
        });
        setGame(result.game);
        announceLocalUpdate(result.game);
        return result.game;
      } catch (toolError) {
        setActionError(toolError instanceof Error ? toolError.message : "The last entry could not be undone.");
        throw toolError;
      } finally {
        setPending(null);
      }
    };

    void register({
      name: "add_points",
      title: "Add points",
      description: "Add a whole-number amount to the score controlled by this phone.",
      inputSchema: pointSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const nextGame = await toolChangeScore("add", input);
        return { code: nextGame.code, side: memory.side, score: memory.side === 1 ? nextGame.sideOneScore : nextGame.sideTwoScore };
      },
    });
    void register({
      name: "subtract_points",
      title: "Subtract points",
      description: "Subtract a whole-number amount from the score controlled by this phone.",
      inputSchema: pointSchema,
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const nextGame = await toolChangeScore("subtract", input);
        return { code: nextGame.code, side: memory.side, score: memory.side === 1 ? nextGame.sideOneScore : nextGame.sideTwoScore };
      },
    });
    void register({
      name: "undo_last_entry",
      title: "Undo last entry",
      description: "Reverse the most recent scoring entry made by this controller.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute() {
        const nextGame = await toolUndo();
        return { code: nextGame.code, side: memory.side, score: memory.side === 1 ? nextGame.sideOneScore : nextGame.sideTwoScore };
      },
    });

    return () => lifecycle.abort();
  }, [memory, setGame]);

  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void changeScore("add");
  }

  if (loading && !game) {
    return <main className="center-state controller-center"><LoaderCircle className="spin" size={30} /><p>Connecting controller…</p></main>;
  }

  if (!game) {
    return (
      <main className="center-state controller-center">
        <span className="state-icon"><Unplug size={28} /></span>
        <h1>Controller unavailable</h1>
        <p>{error ?? "This game could not be found."}</p>
      </main>
    );
  }

  const controlledName = memory.side === 1 ? game.sideOneName : game.sideTwoName;
  const disabled = pending !== null || game.status !== "active";
  const buttonAmount = Number(amount);
  const addButtonLabel =
    Number.isInteger(buttonAmount) && buttonAmount > 0
      ? `Add ${buttonAmount.toLocaleString()}`
      : "Add points";

  return (
    <main className={`controller-page controller-side-${memory.side}`}>
      <header className="controller-header">
        <BrandMark compact />
        <ConnectionBadge state={connection} />
      </header>

      <section className="controller-score-wrap">
        <div className="controller-game-meta">
          <span>Game {game.code}</span>
          <span>Round {game.roundNumber}</span>
        </div>
        <ScorePair game={game} compact controlledSide={memory.side} />
      </section>

      <section className="scoring-panel">
        <div className="control-identity">
          <span className="control-check"><ShieldCheck size={18} /></span>
          <div>
            <span>You control</span>
            <strong>{controlledName}</strong>
          </div>
        </div>

        <form onSubmit={submitAdd} className="score-form">
          <div className="point-entry-heading">
            <label htmlFor="point-amount">Enter points</label>
            <span id="point-amount-helper">Tap to type any amount</span>
          </div>
          <input
            ref={inputRef}
            id="point-amount"
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
            aria-describedby={
              actionError
                ? "point-amount-helper score-action-error"
                : "point-amount-helper"
            }
          />

          <button className="add-button" type="submit" disabled={disabled}>
            {pending === "add" ? <LoaderCircle className="spin" size={34} /> : <Plus size={38} strokeWidth={2.7} />}
            <span>{addButtonLabel}</span>
          </button>
        </form>

        <div className="correction-row">
          <button className="undo-button" type="button" onClick={undoLastEntry} disabled={disabled}>
            {pending === "undo" ? <LoaderCircle className="spin" size={18} /> : <Undo2 size={18} />}
            Undo
          </button>
          <button className="subtract-button" type="button" onClick={() => void changeScore("subtract")} disabled={disabled}>
            {pending === "subtract" ? <LoaderCircle className="spin" size={17} /> : <Minus size={17} />}
            Subtract
          </button>
        </div>

        {actionError ? <p id="score-action-error" className="action-error" role="alert">{actionError}</p> : <p className="action-hint">Undo reverses your last entry.</p>}
      </section>
    </main>
  );
}

export function ControllerView({ invite }: { invite: string }) {
  const [memory, setMemory] = useState<ControllerMemory | null>(null);
  const [claiming, setClaiming] = useState(true);
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimStarted = useRef(false);

  useEffect(() => {
    if (claimStarted.current) return;
    claimStarted.current = true;

    const saved = readControllerMemory(invite);
    if (saved) {
      queueMicrotask(() => {
        setMemory(saved);
        setClaiming(false);
      });
      return;
    }

    apiRequest<ClaimedController>("/api/controllers/claim", {
      method: "POST",
      body: JSON.stringify({ inviteToken: invite }),
    })
      .then((claimed) => {
        const nextMemory: ControllerMemory = {
          code: claimed.game.code,
          side: claimed.side,
          sessionToken: claimed.sessionToken,
        };
        window.localStorage.setItem(`${CONTROLLER_STORAGE_PREFIX}${invite}`, JSON.stringify(nextMemory));
        setMemory(nextMemory);
        announceLocalUpdate(claimed.game);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ClientApiError && requestError.code === "already_claimed") {
          setClaimError("This controller has already been connected to another phone. Ask the scoreboard host to replace it for a new QR code.");
        } else {
          setClaimError(requestError instanceof Error ? requestError.message : "This controller link could not be opened.");
        }
      })
      .finally(() => setClaiming(false));
  }, [invite]);

  if (memory) return <ActiveController memory={memory} />;

  if (claiming) {
    return (
      <main className="center-state controller-center">
        <LoaderCircle className="spin" size={32} />
        <h1>Connecting your controller</h1>
        <p>This takes just a moment.</p>
      </main>
    );
  }

  return (
    <main className="center-state controller-center">
      <span className="state-icon"><Unplug size={28} /></span>
      <h1>Controller unavailable</h1>
      <p>{claimError ?? "This controller link is not valid."}</p>
      <Link className="secondary-button" href="/">Create a new game</Link>
    </main>
  );
}
