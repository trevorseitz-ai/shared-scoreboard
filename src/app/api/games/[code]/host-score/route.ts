import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { applyHostScore } from "@/lib/game-store";
import { hostScoreActionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = hostScoreActionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        {
          error:
            parsed.error.issues[0]?.message ?? "Enter a valid point amount.",
          code: "invalid",
        },
        { status: 400 },
      );
    }

    const { code } = await params;
    const delta =
      parsed.data.operation === "add"
        ? parsed.data.amount
        : -parsed.data.amount;
    const game = await applyHostScore(
      code,
      parsed.data.hostToken,
      parsed.data.side,
      delta,
      parsed.data.actionId,
    );
    return noStoreJson({ game });
  } catch (error) {
    return errorResponse(error);
  }
}
