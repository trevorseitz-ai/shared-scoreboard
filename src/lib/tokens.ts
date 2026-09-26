import { createHash, randomBytes, randomUUID } from "node:crypto";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createGameCode(length = 8) {
  const bytes = randomBytes(length);
  let code = "";

  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }

  return code;
}

export function createSecretToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function createRealtimeTopic() {
  return `game:${randomBytes(24).toString("base64url")}:score`;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createActionId() {
  return randomUUID();
}

