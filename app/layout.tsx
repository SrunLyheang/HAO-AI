import type { Metadata } from "next";
import { Newsreader, Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hao AI",
  description: "Private spoken Mandarin conversation practice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider ui={ui}>
      <html
        lang="en"
        className={`${newsreader.variable} ${geistSans.variable} ${geistMono.variable}`}
        suppressHydrationWarning
      >
        <head>
          {/* Sets data-theme before first paint so a returning dark-mode
              user never sees a light flash (theme preference lives in
              localStorage, read again post-hydration by preference-store). */}
          <script
            dangerouslySetInnerHTML={{
              __html:
                "try{if(localStorage.getItem('theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}",
            }}
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
