import type {
  ClaimedController,
  CreatedGame,
  GameSide,
  PublicGameState,
} from "@/lib/game-types";
import {
  applyDemoHostScore,
  applyDemoScore,
  claimDemoController,
  createDemoGame,
  getDemoGame,
  rematchDemoGame,
  replaceDemoController,
  StoreError,
  undoDemoHostScore,
  undoDemoScore,
} from "@/lib/demo-store";
import {
  createGameCode,
  createRealtimeTopic,
  createSecretToken,
  hashToken,
} from "@/lib/tokens";
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
} from "@/lib/supabase-server";

interface GameRow {
  public_code: string;
  side_one_name: string;
  side_two_name: string;
  side_one_score: number | string;
  side_two_score: number | string;
  round_number: number;
  version: number | string;
  status: string;
  realtime_topic: string;
  controller_one_claimed: boolean;
  controller_two_claimed: boolean;
  expires_at: string;
}

function shouldUseDemoStore() {
  if (isSupabaseConfigured()) return false;
  if (process.env.NODE_ENV !== "production") return true;
  throw new StoreError(
    "configuration",
    "The scoreboard database has not been configured yet.",
  );
}

function toPublicGame(row: GameRow): PublicGameState {
  const expired =
    row.status !== "active" || new Date(row.expires_at).getTime() <= Date.now();

  return {
    code: row.public_code,
    sideOneName: row.side_one_name,
    sideTwoName: row.side_two_name,
    sideOneScore: Number(row.side_one_score),
    sideTwoScore: Number(row.side_two_score),
    roundNumber: Number(row.round_number),
    version: Number(row.version),
    status: expired ? "expired" : "active",
    realtimeTopic: row.realtime_topic,
    controllerOneClaimed: row.controller_one_claimed,
    controllerTwoClaimed: row.controller_two_claimed,
    expiresAt: row.expires_at,
    demo: false,
  };
}

function mapDatabaseError(error: { code?: string; message?: string }) {
  const message = error.message ?? "The scoreboard could not be updated.";

  if (message.includes("scoreboard:not_found")) {
    return new StoreError("not_found", "Scoreboard not found.");
  }
  if (message.includes("scoreboard:expired")) {
    return new StoreError("expired", "This scoreboard has expired.");
  }
  if (message.includes("scoreboard:forbidden")) {
    return new StoreError("forbidden", "This controller is no longer active.");
  }
  if (message.includes("scoreboard:already_claimed")) {
    return new StoreError(
      "already_claimed",
      "This controller is already connected to another device.",
    );
  }
  if (message.includes("scoreboard:nothing_to_undo")) {
    return new StoreError("nothing_to_undo", "There is no entry to undo.");
  }
  if (message.includes("scoreboard:below_zero")) {
    return new StoreError("below_zero", "A score cannot go below zero.");
  }

  return new Error(message);
}

async function getDatabaseGame(code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_scoreboard_game", {
    p_public_code: code.toUpperCase(),
  });

  if (error) throw mapDatabaseError(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new StoreError("not_found", "Scoreboard not found.");

  return toPublicGame(row as unknown as GameRow);
}

export async function createGame(
  sideOneName: string,
  sideTwoName: string,
): Promise<CreatedGame> {
  if (shouldUseDemoStore()) return createDemoGame(sideOneName, sideTwoName);

  const supabase = getSupabaseServerClient();
  const hostToken = createSecretToken();
  const controllerOneInvite = createSecretToken();
  const controllerTwoInvite = createSecretToken();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicCode = createGameCode();
    const { error } = await supabase.rpc("create_scoreboard_game", {
      p_public_code: publicCode,
      p_side_one_name: sideOneName,
      p_side_two_name: sideTwoName,
      p_realtime_topic: createRealtimeTopic(),
      p_host_hash: hashToken(hostToken),
      p_controller_one_invite_hash: hashToken(controllerOneInvite),
      p_controller_two_invite_hash: hashToken(controllerTwoInvite),
    });

    if (!error) {
      return {
        game: await getDatabaseGame(publicCode),
        secrets: { hostToken, controllerOneInvite, controllerTwoInvite },
      };
    }

    if (error?.code !== "23505") throw mapDatabaseError(error ?? {});
  }

  throw new Error("Could not create a unique scoreboard code.");
}

export async function getGame(code: string): Promise<PublicGameState> {
  if (shouldUseDemoStore()) return getDemoGame(code);
  return getDatabaseGame(code);
}

export async function claimController(
  inviteToken: string,
): Promise<ClaimedController> {
  if (shouldUseDemoStore()) return claimDemoController(inviteToken);

  const supabase = getSupabaseServerClient();
  const sessionToken = createSecretToken();
  const { data, error } = await supabase.rpc("claim_scoreboard_controller", {
    p_invite_hash: hashToken(inviteToken),
    p_session_hash: hashToken(sessionToken),
  });

  if (error) throw mapDatabaseError(error);
  const result = data as { code?: string; side?: number } | null;
  if (!result?.code || (result.side !== 1 && result.side !== 2)) {
    throw new Error("The controller claim returned an invalid response.");
  }

  return {
    game: await getDatabaseGame(result.code),
    side: result.side as GameSide,
    sessionToken,
  };
}

export async function applyScore(
  code: string,
  sessionToken: string,
  delta: number,
  actionId: string,
) {
  if (shouldUseDemoStore()) {
    return applyDemoScore(code, sessionToken, delta, actionId);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("apply_score_action", {
    p_public_code: code.toUpperCase(),
    p_controller_hash: hashToken(sessionToken),
    p_delta: delta,
    p_action_id: actionId,
  });
  if (error) throw mapDatabaseError(error);
  return getDatabaseGame(code);
}

export async function undoScore(
  code: string,
  sessionToken: string,
  actionId: string,
) {
  if (shouldUseDemoStore()) {
    return undoDemoScore(code, sessionToken, actionId);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("undo_score_action", {
    p_public_code: code.toUpperCase(),
    p_controller_hash: hashToken(sessionToken),
    p_action_id: actionId,
  });
  if (error) throw mapDatabaseError(error);
  return getDatabaseGame(code);
}

export async function applyHostScore(
  code: string,
  hostToken: string,
  side: GameSide,
  delta: number,
  actionId: string,
) {
  if (shouldUseDemoStore()) {
    return applyDemoHostScore(code, hostToken, side, delta, actionId);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("apply_host_score_action", {
    p_public_code: code.toUpperCase(),
    p_host_hash: hashToken(hostToken),
    p_side: side,
    p_delta: delta,
    p_action_id: actionId,
  });
  if (error) throw mapDatabaseError(error);
  return getDatabaseGame(code);
}

export async function undoHostScore(
  code: string,
  hostToken: string,
  side: GameSide,
  actionId: string,
) {
  if (shouldUseDemoStore()) {
    return undoDemoHostScore(code, hostToken, side, actionId);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("undo_host_score_action", {
    p_public_code: code.toUpperCase(),
    p_host_hash: hashToken(hostToken),
    p_side: side,
    p_action_id: actionId,
  });
  if (error) throw mapDatabaseError(error);
  return getDatabaseGame(code);
}

export async function startRematch(code: string, hostToken: string) {
  if (shouldUseDemoStore()) return rematchDemoGame(code, hostToken);

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.rpc("start_scoreboard_rematch", {
    p_public_code: code.toUpperCase(),
    p_host_hash: hashToken(hostToken),
  });
  if (error) throw mapDatabaseError(error);
  return getDatabaseGame(code);
}

export async function replaceController(
  code: string,
  hostToken: string,
  side: GameSide,
) {
  if (shouldUseDemoStore()) {
    return replaceDemoController(code, hostToken, side);
  }

  const supabase = getSupabaseServerClient();
  const inviteToken = createSecretToken();
  const { error } = await supabase.rpc("replace_scoreboard_controller", {
    p_public_code: code.toUpperCase(),
    p_host_hash: hashToken(hostToken),
    p_side: side,
    p_invite_hash: hashToken(inviteToken),
  });
  if (error) throw mapDatabaseError(error);

  return { game: await getDatabaseGame(code), inviteToken };
}

export { StoreError };
