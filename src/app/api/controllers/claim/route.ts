import { errorResponse, noStoreJson, readJson } from "@/lib/api-response";
import { claimController } from "@/lib/game-store";
import { claimControllerSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = claimControllerSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return noStoreJson(
        { error: "This controller link is not valid.", code: "invalid" },
        { status: 400 },
      );
    }

    return noStoreJson(await claimController(parsed.data.inviteToken));
  } catch (error) {
    return errorResponse(error);
  }
}
