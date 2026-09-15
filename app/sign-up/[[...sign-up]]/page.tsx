"use client";

import { useSyncExternalStore } from "react";
import { SignUp } from "@clerk/nextjs";
import AuthShell from "@/components/auth/AuthShell";
import { getAuthAppearance } from "@/components/auth/clerk-appearance";
import { themePreference } from "@/components/preference-store";

export default function SignUpPage() {
  const darkMode = useSyncExternalStore(
    themePreference.subscribe,
    themePreference.read,
    themePreference.getServer,
  );

  return (
    <AuthShell
      heading="Create your hao.AI account"
      subheading="Start practicing spoken Mandarin in minutes."
    >
      <SignUp appearance={getAuthAppearance(darkMode)} />
    </AuthShell>
  );
}
