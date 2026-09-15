"use client";

import { useSyncExternalStore } from "react";
import { SignIn } from "@clerk/nextjs";
import AuthShell from "@/components/auth/AuthShell";
import { getAuthAppearance } from "@/components/auth/clerk-appearance";
import { themePreference } from "@/components/preference-store";

export default function SignInPage() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const darkMode = useSyncExternalStore(
    themePreference.subscribe,
    themePreference.read,
    themePreference.getServer,
  );

  return (
    <AuthShell heading="Welcome to hao.AI" subheading="Sign in to keep practicing spoken Mandarin.">
      {mounted ? <SignIn appearance={getAuthAppearance(darkMode)} /> : null}
    </AuthShell>
  );
}
