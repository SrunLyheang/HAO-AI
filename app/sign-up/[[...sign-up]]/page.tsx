import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/components/auth/AuthShell";
import { authAppearance } from "@/components/auth/clerk-appearance";

export default function SignUpPage() {
  return (
    <AuthShell
      heading="Create your hao.AI account"
      subheading="Start practicing spoken Mandarin in minutes."
    >
      <SignUp appearance={authAppearance} />
    </AuthShell>
  );
}
