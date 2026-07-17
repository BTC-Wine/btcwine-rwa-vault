import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Cormorant_Garamond, Inter } from "next/font/google";
import { DemoToggle } from "@/components/DemoToggle";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { I18nProvider } from "@/components/I18nProvider";
import { TestBanner } from "@/components/TestBanner";
import { WalletProvider } from "@/components/WalletProvider";
import { locales, htmlLang, isLocale, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { makeT } from "@/lib/i18n/translate";
import { SITE_URL } from "@/lib/site";
import "@/app/globals.css";

const serif = Cormorant_Garamond({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-cormorant",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-inter" });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  const t = makeT(dict, "common");
  const title = t("metadata.title");
  const description = t("metadata.description");
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "TERWA",
      title,
      description,
      locale: htmlLang[lang],
      images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale = lang as Locale;
  const dict = await getDictionary(locale);

  return (
    <html
      lang={htmlLang[locale]}
      className={`${sans.variable} ${serif.variable} antialiased`}
    >
      <body className="min-h-screen bg-[#faf7f2] font-sans text-stone-900">
        <I18nProvider locale={locale} dict={dict}>
          <WalletProvider>
            <TestBanner />
            <Header />
            <main>{children}</main>
            <Footer />
            <DemoToggle />
          </WalletProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
