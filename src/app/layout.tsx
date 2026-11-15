import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Gestão de Cozinha", template: "%s | Gestão de Cozinha" },
  description: "Sistema para controle de estoque, transferências e produção da cozinha.",
  applicationName: "Gestão de Cozinha",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Cozinha" },
  icons: { apple: "/pwa/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#234367", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        <PwaProvider />
        <AuthProvider>
          <InventoryProvider>{children}</InventoryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
