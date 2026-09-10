import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hao.AI",
  description: "Private spoken Mandarin conversation practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
