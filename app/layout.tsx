import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NotificationsProvider } from "@/app/components/notifications-provider";
import { getAuthorizationContext } from "@/lib/authorization";
import AccessProvider from "@/app/components/access-provider";
import AccessRefresh from "@/app/components/access-refresh";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TeamPlan",
  description: "Dein Teamportal für Schichtplan, Urlaub und Mitarbeiter.",
  applicationName: "TeamPlan",
  appleWebApp: {
    capable: true,
    title: "TeamPlan",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#174c37",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const access = await getAuthorizationContext();
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AccessProvider initialAccess={access}>
          <AccessRefresh initialAccess={access} />
          <NotificationsProvider>{children}</NotificationsProvider>
        </AccessProvider>
      </body>
    </html>
  );
}
