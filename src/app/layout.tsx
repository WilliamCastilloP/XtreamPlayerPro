import type { Metadata, Viewport } from "next";
import { Figtree, Syne } from "next/font/google";
import { PlaylistProvider } from "@/components/providers/PlaylistProvider";
import "./globals.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "XtreamPlayerPro",
  description:
    "Modern Xtream Codes PWA — Live TV, Movies, Series with a cinematic player.",
  applicationName: "XtreamPlayerPro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "XtreamPlayerPro",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0F14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${figtree.variable} h-full`}>
      <body className="min-h-dvh antialiased">
        <PlaylistProvider>{children}</PlaylistProvider>
      </body>
    </html>
  );
}
