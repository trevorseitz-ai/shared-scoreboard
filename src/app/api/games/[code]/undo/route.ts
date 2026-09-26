import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { undoScore } from "@/lib/game-store";
import { undoActionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = undoActionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: "This controller session is not valid.", code: "invalid" },
        { status: 400 },
      );
    }

    const { code } = await params;
    const game = await undoScore(code, parsed.data.sessionToken, parsed.data.actionId);
    return noStoreJson({ game });
  } catch (error) {
    return errorResponse(error);
  }
}
