import { createGame } from "@/lib/game-store";
import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { createGameSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = createGameSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: parsed.error.issues[0]?.message ?? "Check both names.", code: "invalid" },
        { status: 400 },
      );
    }

    return noStoreJson(
      await createGame(parsed.data.sideOneName, parsed.data.sideTwoName),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
