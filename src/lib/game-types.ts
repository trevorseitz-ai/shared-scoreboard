export type GameSide = 1 | 2;

export type GameStatus = "active" | "expired";

export interface PublicGameState {
  code: string;
  sideOneName: string;
  sideTwoName: string;
  sideOneScore: number;
  sideTwoScore: number;
  roundNumber: number;
  version: number;
  status: GameStatus;
  realtimeTopic: string | null;
  controllerOneClaimed: boolean;
  controllerTwoClaimed: boolean;
  expiresAt: string;
  demo: boolean;
}

export interface GameSecrets {
  hostToken: string;
  controllerOneInvite: string;
  controllerTwoInvite: string;
}

export interface CreatedGame {
  game: PublicGameState;
  secrets: GameSecrets;
}

export interface ClaimedController {
  game: PublicGameState;
  side: GameSide;
  sessionToken: string;
}

export interface ControllerMemory {
  code: string;
  side: GameSide;
  sessionToken: string;
}

