import type {
  Metadata,
} from "next";

import type {
  ReactNode,
} from "react";

import {
  Inter,
} from "next/font/google";

import {
  AuthProvider,
} from "@/contexts/AuthContext";

import {
  InventoryProvider,
} from "@/contexts/InventoryContext";

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
  children: ReactNode;
}

export default function RootLayout({
  children,
}: Readonly<RootLayoutProps>) {
  return (
    <html lang="pt-BR">
      <body className={inter.variable}>
        <AuthProvider>
          <InventoryProvider>
            {children}
          </InventoryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}