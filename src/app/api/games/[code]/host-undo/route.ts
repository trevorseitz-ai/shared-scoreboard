import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { undoHostScore } from "@/lib/game-store";
import { hostUndoActionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = hostUndoActionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: "The host scoring permission is not valid.", code: "invalid" },
        { status: 400 },
      );
    }

    const { code } = await params;
    const game = await undoHostScore(
      code,
      parsed.data.hostToken,
      parsed.data.side,
      parsed.data.actionId,
    );
    return noStoreJson({ game });
  } catch (error) {
    return errorResponse(error);
  }
}
