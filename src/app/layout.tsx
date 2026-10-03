import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { Chrome } from "@/components/Chrome";
import { Toast } from "@/components/ui";
import { PathwayProvider } from "@/lib/store";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["600", "700", "800", "900"] });

export const metadata: Metadata = {
  title: "Pathway",
  description: "Your status is calculated on your device and never stored by Pathway.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} antialiased`}>
      <body className="min-h-dvh overflow-x-clip">
        <PathwayProvider>
          <Chrome>{children}</Chrome>
          <Toast />
        </PathwayProvider>
      </body>
    </html>
  );
}
