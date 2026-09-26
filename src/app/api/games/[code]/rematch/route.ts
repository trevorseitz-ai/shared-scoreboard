import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { startRematch } from "@/lib/game-store";
import { hostActionSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = hostActionSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: "The host permission is not valid.", code: "invalid" },
        { status: 400 },
      );
    }

    const { code } = await params;
    const game = await startRematch(code, parsed.data.hostToken);
    return noStoreJson({ game });
  } catch (error) {
    return errorResponse(error);
  }
}
