import { cookies, headers } from "next/headers";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider, type LocaleCode } from "@/lib/i18n";
import { AiChatWidget } from "@/components/ai-chat-widget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ArkAgentic",
  description:
    "One OpenAI-compatible gateway for top domestic and global AI models with ultra-fast response, pay-as-you-go pricing, and instant onboarding.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get("ark_locale")?.value;
  const acceptLanguage = (headerStore.get("accept-language") || "").toLowerCase();

  const fromAccept: LocaleCode | null = acceptLanguage.startsWith("zh")
    ? "zh"
    : acceptLanguage.startsWith("fr")
      ? "fr"
      : acceptLanguage.startsWith("de")
        ? "de"
        : acceptLanguage.startsWith("ja")
          ? "ja"
          : acceptLanguage.startsWith("ko")
            ? "ko"
            : acceptLanguage.startsWith("en")
              ? "en"
              : null;

  const initialLocale: LocaleCode =
    cookieLocale === "en" || cookieLocale === "zh" || cookieLocale === "fr" || cookieLocale === "de" || cookieLocale === "ja" || cookieLocale === "ko"
      ? cookieLocale
      : fromAccept ?? "en";

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider initialLocale={initialLocale}>
          {children}
          <AiChatWidget />
        </I18nProvider>
      </body>
    </html>
  );
}
