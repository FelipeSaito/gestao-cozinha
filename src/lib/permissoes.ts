import type { UserRole } from "@/types";

export const PERFIS: readonly UserRole[] = [
  "dono",
  "producao",
  "feirantes",
  "administracao",
];

export const PERMISSOES: Readonly<Record<string, readonly UserRole[]>> = {
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
  const lista = Array.isArray(dados.perfis)
    ? dados.perfis.filter(perfilValido)
    : [];
  const legado = perfilValido(dados.perfil) ? [dados.perfil] : [];

  return [...new Set<UserRole>([...lista, ...legado])];
}

export function getRotaInicial(perfil?: UserRole): string {
  switch (perfil) {
    case "dono":
      return "/relatorios";
    case "producao":
      return "/producao";
    case "feirantes":
      return "/feiras";
    case "administracao":
      return "/estoque-principal";
    default:
      return "/login";
  }
}

export function perfilPodeAcessar(perfil: UserRole, rota: string): boolean {
  if (rota === "/login" || rota.startsWith("/login/")) {
    return true;
  }

  const entrada = Object.entries(PERMISSOES).find(
    ([caminho]) => rota === caminho || rota.startsWith(`${caminho}/`),
  );

  return entrada ? entrada[1].includes(perfil) : false;
}
