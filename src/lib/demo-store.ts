import type {
  ClaimedController,
  CreatedGame,
  GameSide,
  PublicGameState,
} from "@/lib/game-types";
import {
  createGameCode,
  createRealtimeTopic,
  createSecretToken,
  hashToken,
} from "@/lib/tokens";

interface DemoEvent {
  id: string;
  side: GameSide;
  delta: number;
  roundNumber: number;
  actionId: string;
  undone: boolean;
  kind: "add" | "subtract" | "undo";
  createdAt: number;
}

interface DemoGame {
  code: string;
  sideOneName: string;
  sideTwoName: string;
  sideOneScore: number;
  sideTwoScore: number;
  roundNumber: number;
  version: number;
  realtimeTopic: string;
  hostTokenHash: string;
  controllerOneInviteHash: string;
  controllerTwoInviteHash: string;
  controllerOneSessionHash: string | null;
  controllerTwoSessionHash: string | null;
  controllerOneClaimedAt: number | null;
  controllerTwoClaimedAt: number | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  events: DemoEvent[];
}

interface DemoStoreGlobal {
  __sharedScoreboardDemoStore?: Map<string, DemoGame>;
}

const globalStore = globalThis as typeof globalThis & DemoStoreGlobal;

function store() {
  if (!globalStore.__sharedScoreboardDemoStore) {
    globalStore.__sharedScoreboardDemoStore = new Map();
  }

  return globalStore.__sharedScoreboardDemoStore;
}

function extendExpiry(game: DemoGame) {
  const now = Date.now();
  game.updatedAt = now;
  game.expiresAt = now + 24 * 60 * 60 * 1000;
}

function publicState(game: DemoGame): PublicGameState {
  return {
    code: game.code,
    sideOneName: game.sideOneName,
    sideTwoName: game.sideTwoName,
    sideOneScore: game.sideOneScore,
    sideTwoScore: game.sideTwoScore,
    roundNumber: game.roundNumber,
    version: game.version,
    status: game.expiresAt > Date.now() ? "active" : "expired",
    realtimeTopic: game.realtimeTopic,
    controllerOneClaimed: Boolean(game.controllerOneSessionHash),
    controllerTwoClaimed: Boolean(game.controllerTwoSessionHash),
    expiresAt: new Date(game.expiresAt).toISOString(),
    demo: true,
  };
}

function gameByCode(code: string) {
  const game = store().get(code.toUpperCase());
  if (!game) throw new StoreError("not_found", "Scoreboard not found.");
  if (game.expiresAt <= Date.now()) {
    throw new StoreError("expired", "This scoreboard has expired.");
  }
  return game;
}

function sideForSession(game: DemoGame, sessionToken: string): GameSide {
  const hash = hashToken(sessionToken);
  if (hash === game.controllerOneSessionHash) return 1;
  if (hash === game.controllerTwoSessionHash) return 2;
  throw new StoreError("forbidden", "This controller is no longer active.");
}

function verifyHost(game: DemoGame, hostToken: string) {
  if (hashToken(hostToken) !== game.hostTokenHash) {
    throw new StoreError("forbidden", "Only the scoreboard host can do that.");
  }
}

export class StoreError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "expired"
      | "forbidden"
      | "already_claimed"
      | "nothing_to_undo"
      | "below_zero"
      | "configuration",
    message: string,
  ) {
    super(message);
  }
}

export function createDemoGame(
  sideOneName: string,
  sideTwoName: string,
): CreatedGame {
  let code = createGameCode();
  while (store().has(code)) code = createGameCode();

  const hostToken = createSecretToken();
  const controllerOneInvite = createSecretToken();
  const controllerTwoInvite = createSecretToken();
  const now = Date.now();

  const game: DemoGame = {
    code,
    sideOneName,
    sideTwoName,
    sideOneScore: 0,
    sideTwoScore: 0,
    roundNumber: 1,
    version: 1,
    realtimeTopic: createRealtimeTopic(),
    hostTokenHash: hashToken(hostToken),
    controllerOneInviteHash: hashToken(controllerOneInvite),
    controllerTwoInviteHash: hashToken(controllerTwoInvite),
    controllerOneSessionHash: null,
    controllerTwoSessionHash: null,
    controllerOneClaimedAt: null,
    controllerTwoClaimedAt: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    events: [],
  };

  store().set(code, game);

  return {
    game: publicState(game),
    secrets: { hostToken, controllerOneInvite, controllerTwoInvite },
  };
}

export function getDemoGame(code: string) {
  return publicState(gameByCode(code));
}

export function claimDemoController(inviteToken: string): ClaimedController {
  const inviteHash = hashToken(inviteToken);
  let matching: { game: DemoGame; side: GameSide } | null = null;

  for (const game of store().values()) {
    if (game.controllerOneInviteHash === inviteHash) {
      matching = { game, side: 1 };
      break;
    }
    if (game.controllerTwoInviteHash === inviteHash) {
      matching = { game, side: 2 };
      break;
    }
  }

  if (!matching) throw new StoreError("not_found", "Controller link not found.");
  const { game, side } = matching;

  if (game.expiresAt <= Date.now()) {
    throw new StoreError("expired", "This scoreboard has expired.");
  }

  const alreadyClaimed =
    side === 1
      ? game.controllerOneSessionHash
      : game.controllerTwoSessionHash;
  if (alreadyClaimed) {
    throw new StoreError(
      "already_claimed",
      "This controller is already connected to another device.",
    );
  }

  const sessionToken = createSecretToken();
  if (side === 1) {
    game.controllerOneSessionHash = hashToken(sessionToken);
    game.controllerOneClaimedAt = Date.now();
  } else {
    game.controllerTwoSessionHash = hashToken(sessionToken);
    game.controllerTwoClaimedAt = Date.now();
  }

  game.version += 1;
  extendExpiry(game);

  return { game: publicState(game), side, sessionToken };
}

export function applyDemoScore(
  code: string,
  sessionToken: string,
  delta: number,
  actionId: string,
) {
  const game = gameByCode(code);
  const side = sideForSession(game, sessionToken);

  return applyDemoScoreForSide(game, side, delta, actionId);
}

function applyDemoScoreForSide(
  game: DemoGame,
  side: GameSide,
  delta: number,
  actionId: string,
) {
  if (game.events.some((event) => event.actionId === actionId)) {
    return publicState(game);
  }

  const current = side === 1 ? game.sideOneScore : game.sideTwoScore;
  const next = current + delta;
  if (next < 0) {
    throw new StoreError("below_zero", "A score cannot go below zero.");
  }

  if (side === 1) game.sideOneScore = next;
  else game.sideTwoScore = next;

  game.events.push({
    id: crypto.randomUUID(),
    side,
    delta,
    roundNumber: game.roundNumber,
    actionId,
    undone: false,
    kind: delta > 0 ? "add" : "subtract",
    createdAt: Date.now(),
  });
  game.version += 1;
  extendExpiry(game);
  return publicState(game);
}

export function undoDemoScore(
  code: string,
  sessionToken: string,
  actionId: string,
) {
  const game = gameByCode(code);
  const side = sideForSession(game, sessionToken);

  return undoDemoScoreForSide(game, side, actionId);
}

function undoDemoScoreForSide(
  game: DemoGame,
  side: GameSide,
  actionId: string,
) {
  if (game.events.some((event) => event.actionId === actionId)) {
    return publicState(game);
  }

  const last = [...game.events]
    .reverse()
    .find(
      (event) =>
        event.side === side &&
        event.roundNumber === game.roundNumber &&
        event.kind !== "undo" &&
        !event.undone,
    );

  if (!last) {
    throw new StoreError("nothing_to_undo", "There is no entry to undo.");
  }

  const delta = -last.delta;
  if (side === 1) game.sideOneScore += delta;
  else game.sideTwoScore += delta;
  last.undone = true;

  game.events.push({
    id: crypto.randomUUID(),
    side,
    delta,
    roundNumber: game.roundNumber,
    actionId,
    undone: false,
    kind: "undo",
    createdAt: Date.now(),
  });
  game.version += 1;
  extendExpiry(game);
  return publicState(game);
}

export function applyDemoHostScore(
  code: string,
  hostToken: string,
  side: GameSide,
  delta: number,
  actionId: string,
) {
  const game = gameByCode(code);
  verifyHost(game, hostToken);
  return applyDemoScoreForSide(game, side, delta, actionId);
}

export function undoDemoHostScore(
  code: string,
  hostToken: string,
  side: GameSide,
  actionId: string,
) {
  const game = gameByCode(code);
  verifyHost(game, hostToken);
  return undoDemoScoreForSide(game, side, actionId);
}

export function rematchDemoGame(code: string, hostToken: string) {
  const game = gameByCode(code);
  verifyHost(game, hostToken);
  game.sideOneScore = 0;
  game.sideTwoScore = 0;
  game.roundNumber += 1;
  game.version += 1;
  extendExpiry(game);
  return publicState(game);
}

export function replaceDemoController(
  code: string,
  hostToken: string,
  side: GameSide,
) {
  const game = gameByCode(code);
  verifyHost(game, hostToken);
  const inviteToken = createSecretToken();

  if (side === 1) {
    game.controllerOneInviteHash = hashToken(inviteToken);
    game.controllerOneSessionHash = null;
    game.controllerOneClaimedAt = null;
  } else {
    game.controllerTwoInviteHash = hashToken(inviteToken);
    game.controllerTwoSessionHash = null;
    game.controllerTwoClaimedAt = null;
  }

  game.version += 1;
  extendExpiry(game);
  return { game: publicState(game), inviteToken };
}
