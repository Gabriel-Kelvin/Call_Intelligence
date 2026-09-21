import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Signal | Expert Call Intelligence", description: "Evidence-backed analysis of European robotic surgery expert calls.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
