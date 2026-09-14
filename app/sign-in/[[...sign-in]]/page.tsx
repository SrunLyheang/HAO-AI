import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/components/auth/AuthShell";
import { authAppearance } from "@/components/auth/clerk-appearance";

export default function SignInPage() {
  return (
    <AuthShell heading="Welcome to hao.AI" subheading="Sign in to keep practicing spoken Mandarin.">
      <SignIn appearance={authAppearance} />
    </AuthShell>
  );
}
