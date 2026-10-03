import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Pathway",
  description: "Your risk score is calculated on your device and never stored on a server.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} antialiased`}>
      <body className="min-h-dvh md:pl-64 pb-20 md:pb-0">
        <Sidebar />
        {children}
      </body>
    </html>
  );
}
