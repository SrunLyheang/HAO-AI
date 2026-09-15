// Shared shape behind every localStorage-backed UI preference (hsk_level,
// zh_only_mode, display_support, text_scale) used via useSyncExternalStore in
// app/page.tsx. One implementation instead of one copy per preference.
//
// Lives in components/, not lib/: lib/ is server-only (see
// architecture.md's system-boundaries table — "Must not contain: ...
// client-imported code"), and this is read from a Client Component.

export type PreferenceConfig<T> = {
  storageKey: string;
  changeEvent: string;
  fallback: T;
  isValid: (raw: string) => boolean;
  parse: (raw: string) => T;
  serialize?: (value: T) => string;
};

export function createPersistedPreference<T>(config: PreferenceConfig<T>) {
  const { storageKey, changeEvent, fallback, isValid, parse, serialize = String } = config;

  function read(): T {
    const raw = localStorage.getItem(storageKey);
    return raw !== null && isValid(raw) ? parse(raw) : fallback;
  }

  function getServer(): T {
    return fallback;
  }

  function subscribe(callback: () => void) {
    window.addEventListener(changeEvent, callback);
    window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(changeEvent, callback);
      window.removeEventListener("storage", callback);
    };
  }

  function persist(value: T) {
    localStorage.setItem(storageKey, serialize(value));
    window.dispatchEvent(new Event(changeEvent));
  }

  return { read, getServer, subscribe, persist };
}

// Dark mode — shared by the main app (ConversationScreen) and the Clerk
// auth pages, so both read/write the same "theme" key. The inline script in
// app/layout.tsx reads this same key before first paint so a returning
// dark-mode user never sees a light flash.
export const themePreference = createPersistedPreference<boolean>({
  storageKey: "theme",
  changeEvent: "theme-change",
  fallback: false,
  isValid: () => true,
  parse: (raw) => raw === "dark",
  serialize: (dark) => (dark ? "dark" : "light"),
});
