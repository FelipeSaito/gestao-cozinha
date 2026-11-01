import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { InventoryProvider } from "@/contexts/InventoryContext";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Gestão de Cozinha",
    template: "%s | Gestão de Cozinha",
  },
  description:
    "Sistema para controle de estoque, transferências e produção da cozinha.",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({
  children,
}: Readonly<RootLayoutProps>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        <InventoryProvider>
          {children}
        </InventoryProvider>
      </body>
    </html>
  );
}