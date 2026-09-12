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
