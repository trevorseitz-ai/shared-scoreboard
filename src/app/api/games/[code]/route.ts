import { errorResponse, noStoreJson } from "@/lib/api-response";
import { getGame } from "@/lib/game-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    return noStoreJson({ game: await getGame(code) });
  } catch (error) {
    return errorResponse(error);
  }
}
