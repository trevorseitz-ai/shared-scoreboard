import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";

async function request(path, body, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

const created = await request(
  "/api/games",
  { sideOneName: "North Stars", sideTwoName: "South Club" },
  201,
);
const { game, secrets } = created;
assert.equal(game.sideOneScore, 0);
assert.equal(game.sideTwoScore, 0);

const controllerOne = await request("/api/controllers/claim", {
  inviteToken: secrets.controllerOneInvite,
});
const controllerTwo = await request("/api/controllers/claim", {
  inviteToken: secrets.controllerTwoInvite,
});
assert.equal(controllerOne.side, 1);
assert.equal(controllerTwo.side, 2);

async function score(sessionToken, amount, operation) {
  return request(`/api/games/${game.code}/score`, {
    sessionToken,
    amount,
    operation,
    actionId: randomUUID(),
  });
}

async function undo(sessionToken) {
  return request(`/api/games/${game.code}/undo`, {
    sessionToken,
    actionId: randomUUID(),
  });
}

let state = await score(controllerOne.sessionToken, 7, "add");
assert.equal(state.game.sideOneScore, 7);
state = await undo(controllerOne.sessionToken);
assert.equal(state.game.sideOneScore, 0);

state = await score(controllerOne.sessionToken, 10, "add");
assert.equal(state.game.sideOneScore, 10);
state = await score(controllerOne.sessionToken, 3, "subtract");
assert.equal(state.game.sideOneScore, 7);
state = await undo(controllerOne.sessionToken);
assert.equal(state.game.sideOneScore, 10);

state = await score(controllerTwo.sessionToken, 4, "add");
assert.equal(state.game.sideOneScore, 10);
assert.equal(state.game.sideTwoScore, 4);

state = await request(`/api/games/${game.code}/rematch`, {
  hostToken: secrets.hostToken,
  actionId: randomUUID(),
});
assert.equal(state.game.roundNumber, 2);
assert.equal(state.game.sideOneScore, 0);
assert.equal(state.game.sideTwoScore, 0);

state = await score(controllerTwo.sessionToken, 1, "add");
assert.equal(state.game.sideTwoScore, 1);

await request(`/api/games/${game.code}/replace-controller`, {
  hostToken: secrets.hostToken,
  side: 1,
});
await request(
  `/api/games/${game.code}/score`,
  {
    sessionToken: controllerOne.sessionToken,
    amount: 1,
    operation: "add",
    actionId: randomUUID(),
  },
  403,
);

const finalState = await request(`/api/games/${game.code}`);
assert.equal(finalState.game.sideOneName, "North Stars");
assert.equal(finalState.game.sideTwoName, "South Club");
assert.equal(finalState.game.controllerOneClaimed, false);
assert.equal(finalState.game.controllerTwoClaimed, true);

console.log(`Smoke test passed for game ${game.code}: add, subtract, undo, rematch, controller replacement, and isolation.`);
