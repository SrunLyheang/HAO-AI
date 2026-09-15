// Theming for Clerk's hosted <SignIn>/<SignUp>, so it matches the rest of
// the app in both light and dark mode.
//
// Deliberate exception to code-standards.md's "no raw hex in components":
// Clerk derives its own shades (hover, muted, borders, the footer surface) by
// doing color math on these strings in JS, before any CSS lands. It cannot
// resolve `var(--token)`, and feeding it `transparent` made every derived
// surface collapse to black. The values below are copies of the matching
// tokens in app/globals.css (:root and :root[data-theme="dark"]) — keep them
// in sync if a token changes.
const elements = {
  rootBox: "auth-clerk-fluid",
  cardBox: "auth-clerk-fluid auth-clerk-card",
  card: "auth-clerk-fluid auth-clerk-card",
  header: "auth-clerk-header",
};

export function getAuthAppearance(dark: boolean) {
  return {
    variables: dark
      ? {
          colorPrimary: "#F5F5F3", // --action
          colorBackground: "#1F2023", // --surface
          colorText: "#F5F5F3", // --ink
          colorTextSecondary: "#A9A8A3", // --text-secondary
          colorInputBackground: "#1F2023", // --surface
          colorInputText: "#F5F5F3", // --ink
          colorNeutral: "#E4E3DF", // --text
          colorDanger: "#F0908C", // --err-text
          borderRadius: "4px", // --radius-sm
          fontFamily: "var(--font-sans)",
        }
      : {
          colorPrimary: "#111111", // --action
          colorBackground: "#FFFFFF", // --surface
          colorText: "#111111", // --ink
          colorTextSecondary: "#787774", // --text-secondary
          colorInputBackground: "#FFFFFF", // --surface
          colorInputText: "#111111", // --ink
          colorNeutral: "#2F3437", // --text
          colorDanger: "#9F2F2D", // --err-text
          borderRadius: "4px", // --radius-sm
          fontFamily: "var(--font-sans)",
        },
    elements,
  };
}
