import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SupaShield - Automated Supabase RLS Security Testing",
  description: "Catch Supabase RLS security vulnerabilities before they reach production. Zero configuration, CI/CD ready, production safe.",
  keywords: "supabase, rls, security, testing, cli, row level security, database, postgresql",
  authors: [{ name: "Rodrigotari1" }],
  icons: {
    icon: "/logo-shield-bolt.svg",
    shortcut: "/logo-shield-bolt.svg",
    apple: "/logo-shield-bolt.svg",
  },
  openGraph: {
    title: "SupaShield - Automated Supabase RLS Security Testing",
    description: "Catch Supabase RLS security vulnerabilities before they reach production",
    type: "website",
    url: "https://supashield.dev",
  },
  twitter: {
    card: "summary_large_image",
    title: "SupaShield - Automated Supabase RLS Security Testing",
    description: "Catch Supabase RLS security vulnerabilities before they reach production",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
