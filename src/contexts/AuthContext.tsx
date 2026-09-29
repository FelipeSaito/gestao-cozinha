"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { User, UserRole } from "@/types";
import { firebaseClient } from "@/lib/firebase";

export interface AuthenticatedUser extends User { perfil: UserRole; perfis: UserRole[] }

interface AuthContextValue {
  usuario: AuthenticatedUser | null;
  carregando: boolean;
  sair: () => Promise<void>;
  podeAcessar: (rota: string) => boolean;
  rotaInicial: (perfil?: UserRole) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PERFIS: UserRole[] = ["dono", "producao", "feirantes", "administracao"];

const PERMISSOES: Record<string, UserRole[]> = {
  "/estoque-principal": ["dono", "administracao"],
  "/estoque-cozinha": ["dono", "producao"],
  "/transferencias": ["dono", "administracao"],
  "/producao": ["dono", "producao"],
  "/bar": ["dono", "administracao"],
  "/fornecedores": ["dono", "administracao"],
  "/feiras": ["dono", "producao", "feirantes"],
  "/relatorios": ["dono"],
  "/equipe": ["dono"],
};

export function perfilValido(valor: unknown): valor is UserRole {
  return typeof valor === "string" && PERFIS.includes(valor as UserRole);
}

export function lerPerfis(dados: Record<string, unknown>): UserRole[] {
  const lista = Array.isArray(dados.perfis) ? dados.perfis.filter(perfilValido) : [];
  const legado = perfilValido(dados.perfil) ? [dados.perfil] : [];
  return [...new Set<UserRole>([...lista, ...legado])];
}

export function getRotaInicial(perfil?: UserRole): string {
  switch (perfil) {
    case "dono": return "/relatorios";
    case "producao": return "/producao";
    case "feirantes": return "/feiras";
    case "administracao": return "/estoque-principal";
    default: return "/login";
  }
}

export function perfilPodeAcessar(perfil: UserRole, rota: string): boolean {
  if (rota === "/login" || rota.startsWith("/login/")) return true;
  const entrada = Object.entries(PERMISSOES).find(
    ([caminho]) => rota === caminho || rota.startsWith(`${caminho}/`),
  );
  return entrada ? entrada[1].includes(perfil) : false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<AuthenticatedUser | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let mounted = true;
    const { auth, db } = firebaseClient();
    const unsubscribe = onAuthStateChanged(auth, async (current) => {
      if (!mounted) return;
      setCarregando(true);
      setUsuario(null);
      if (!current) { setCarregando(false); return; }

      try {
        const snapshot = await getDoc(doc(db, "perfis", current.uid));
        if (!mounted) return;
        const dados = snapshot.data();
        const perfis = dados ? lerPerfis(dados) : [];
        if (!snapshot.exists() || perfis.length === 0 ||
          typeof dados?.nome !== "string" ||
          typeof dados?.cargo !== "string" ||
          typeof dados?.iniciais !== "string") {
          await signOut(auth);
          return;
        }
        setUsuario({ id: current.uid, perfil: perfis[0], perfis,
          nome: dados.nome, cargo: dados.cargo, iniciais: dados.iniciais });
      } catch (error) {
        console.error("Não foi possível carregar o perfil:", error);
        if (mounted) setUsuario(null);
      } finally {
        if (mounted) setCarregando(false);
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const sair = useCallback(async () => {
    const { auth } = firebaseClient();
    await signOut(auth);
    setUsuario(null);
  }, []);
  const podeAcessar = useCallback(
    (rota: string) => Boolean(usuario && usuario.perfis.some((perfil) => perfilPodeAcessar(perfil, rota))),
    [usuario],
  );
  const rotaInicial = useCallback(
    (perfil?: UserRole) => getRotaInicial(perfil ?? usuario?.perfil),
    [usuario],
  );
  const value = useMemo<AuthContextValue>(
    () => ({ usuario, carregando, sair, podeAcessar, rotaInicial }),
    [usuario, carregando, sair, podeAcessar, rotaInicial],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser utilizado dentro de AuthProvider.");
  return context;
}