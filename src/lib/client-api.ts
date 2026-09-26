"use client";

import type { PublicGameState } from "@/lib/game-types";

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string; code?: string }
    | T
    | null;

  if (!response.ok) {
    const failure = body as { error?: string; code?: string } | null;
    throw new ClientApiError(
      failure?.error ?? "The request could not be completed.",
      failure?.code ?? "unknown",
      response.status,
    );
  }

  return body as T;
}

export function announceLocalUpdate(game: PublicGameState) {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel(`shared-scoreboard:${game.code}`);
  channel.postMessage({ type: "score_changed", version: game.version });
  channel.close();
}

