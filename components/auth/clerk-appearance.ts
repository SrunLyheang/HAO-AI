// Theming for Clerk's hosted <SignIn>, so it matches the rest of the app.
//
// Deliberate exception to code-standards.md's "no raw hex in components":
// Clerk derives its own shades (hover, muted, borders, the footer surface) by
// doing color math on these strings in JS, before any CSS lands. It cannot
// resolve `var(--token)`, and feeding it `transparent` made every derived
// surface collapse to black. The values below are copies of the matching
// tokens in app/globals.css — keep them in sync if a token changes.
export const authAppearance = {
  variables: {
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
  elements: {
    rootBox: "auth-clerk-fluid",
    cardBox: "auth-clerk-fluid auth-clerk-card",
    card: "auth-clerk-fluid auth-clerk-card",
    header: "auth-clerk-header",
  },
};
