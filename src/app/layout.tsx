import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vendora — Solar Energy Marketplace",
  description: "The renewable energy marketplace: solar panels, LiFePO4 batteries, inverters, submersible pumps and solar lighting from engineer-owned stores — sized right, warrantied for decades.",
  keywords: ["solar panels", "renewable energy", "solar marketplace", "LiFePO4 batteries", "solar inverters", "solar submersible pumps", "solar energy products", "Vendora"],
  authors: [{ name: "Vendora" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Vendora — Solar Energy Marketplace",
    description: "Power everything with sunlight — solar panels, storage, inverters and pumps from independent stores.",
    siteName: "Vendora",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
