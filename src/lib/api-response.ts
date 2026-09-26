import { StoreError } from "@/lib/game-store";

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return Response.json(data, { ...init, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof StoreError) {
    const statusByCode: Record<StoreError["code"], number> = {
      not_found: 404,
      expired: 410,
      forbidden: 403,
      already_claimed: 409,
      nothing_to_undo: 409,
      below_zero: 409,
      configuration: 503,
    };

    return noStoreJson(
      { error: error.message, code: error.code },
      { status: statusByCode[error.code] },
    );
  }

  console.error("Scoreboard request failed", error);
  return noStoreJson(
    { error: "Something went wrong. Please try again.", code: "unknown" },
    { status: 500 },
  );
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

