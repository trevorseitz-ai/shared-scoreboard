import type { Metadata } from "next";
import { ScoreboardView } from "@/components/scoreboard-view";

export const metadata: Metadata = {
  title: "Live game",
  robots: { index: false, follow: false },
};

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ScoreboardView code={code} />;
}
