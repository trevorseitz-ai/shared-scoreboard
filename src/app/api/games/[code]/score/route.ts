import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { applyScore } from "@/lib/game-store";
import { scoreActionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = scoreActionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: parsed.error.issues[0]?.message ?? "Enter a valid point amount.", code: "invalid" },
        { status: 400 },
      );
    }

    const { code } = await params;
    const delta = parsed.data.operation === "add" ? parsed.data.amount : -parsed.data.amount;
    const game = await applyScore(code, parsed.data.sessionToken, delta, parsed.data.actionId);
    return noStoreJson({ game });
  } catch (error) {
    return errorResponse(error);
  }
}
