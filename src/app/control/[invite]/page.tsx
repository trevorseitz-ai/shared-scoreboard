import type { Metadata } from "next";
import { ControllerView } from "@/components/controller-view";

export const metadata: Metadata = {
  title: "Score controller",
  robots: { index: false, follow: false },
};

export default async function ControllerPage({
  params,
}: {
  params: Promise<{ invite: string }>;
}) {
  const { invite } = await params;
  return <ControllerView invite={invite} />;
}
