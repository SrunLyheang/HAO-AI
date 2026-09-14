import { auth } from "@clerk/nextjs/server";
import { getOrCreateActiveConversation } from "@/db/queries";
import ConversationScreen from "@/components/ConversationScreen";

export default async function Page() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  const { conversation, turns } = await getOrCreateActiveConversation(userId);
  return <ConversationScreen conversation={conversation} initialTurns={turns} />;
}
