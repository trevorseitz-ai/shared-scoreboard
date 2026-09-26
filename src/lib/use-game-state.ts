"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicGameState } from "@/lib/game-types";
import { apiRequest } from "@/lib/client-api";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ConnectionState = "connecting" | "live" | "reconnecting" | "local";

export function useGameState(code: string, initialGame?: PublicGameState | null) {
  const [game, setGame] = useState<PublicGameState | null>(initialGame ?? null);
  const [loading, setLoading] = useState(!initialGame);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>(
    initialGame?.demo ? "local" : "connecting",
  );
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (refreshInFlight.current) return refreshInFlight.current;

    const request = apiRequest<{ game: PublicGameState }>(`/api/games/${code}`)
      .then(({ game: nextGame }) => {
        setGame(nextGame);
        setError(null);
        if (nextGame.demo) setConnection("local");
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not load the scoreboard.",
        );
      })
      .finally(() => {
        setLoading(false);
        refreshInFlight.current = null;
      });

    refreshInFlight.current = request;
    return request;
  }, [code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(`shared-scoreboard:${code}`);
    channel.onmessage = () => void refresh();
    return () => channel.close();
  }, [code, refresh]);

  useEffect(() => {
    if (!game?.realtimeTopic || game.demo) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      queueMicrotask(() => setConnection("reconnecting"));
      return;
    }

    const channel = supabase
      .channel(game.realtimeTopic, { config: { private: false } })
      .on("broadcast", { event: "score_changed" }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection("live");
          void refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnection("reconnecting");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [game?.demo, game?.realtimeTopic, refresh]);

  useEffect(() => {
    if (connection !== "reconnecting") return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [connection, refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [refresh]);

  return { game, setGame, loading, error, connection, refresh };
}
