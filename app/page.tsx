import { auth } from "@clerk/nextjs/server";
import ConversationScreen from "@/components/ConversationScreen";

export default async function Page() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  return <ConversationScreen />;
}
