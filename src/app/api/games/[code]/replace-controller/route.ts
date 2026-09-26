import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { replaceController } from "@/lib/game-store";
import { replaceControllerSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const parsed = replaceControllerSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: "The host permission is not valid.", code: "invalid" },
        { status: 400 },
      );
    }

    const { code } = await params;
    return noStoreJson(
      await replaceController(code, parsed.data.hostToken, parsed.data.side),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
