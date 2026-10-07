import { describe, expect, it } from "vitest";
import {
  getRotaInicial,
  lerPerfis,
  PERFIS,
  perfilPodeAcessar,
  perfilValido,
} from "@/lib/permissoes";
import type { UserRole } from "@/types";

describe("perfilValido", () => {
  it.each(PERFIS)("aceita o perfil %s", (perfil) => {
    expect(perfilValido(perfil)).toBe(true);
  });

  it.each([null, undefined, "", "admin", "DONO", 123, {}])(
    "rejeita um perfil inválido: %o",
    (valor) => {
      expect(perfilValido(valor)).toBe(false);
    },
  );
});

describe("lerPerfis", () => {
  it("lê vários perfis atuais", () => {
    expect(lerPerfis({ perfis: ["dono", "producao"] })).toEqual([
      "dono",
      "producao",
    ]);
  });

  it("combina a lista atual com o perfil legado", () => {
    expect(lerPerfis({
      perfis: ["producao"],
      perfil: "feirantes",
    })).toEqual(["producao", "feirantes"]);
  });

  it("remove perfis duplicados", () => {
    expect(lerPerfis({
      perfis: ["dono", "dono"],
      perfil: "dono",
    })).toEqual(["dono"]);
  });

  it("ignora valores inválidos", () => {
    expect(lerPerfis({
      perfis: ["producao", "admin", null, 10],
      perfil: "inválido",
    })).toEqual(["producao"]);
  });

  it("devolve uma lista vazia sem perfil válido", () => {
    expect(lerPerfis({})).toEqual([]);
  });
});

describe("getRotaInicial", () => {
  it.each<[UserRole | undefined, string]>([
    ["dono", "/relatorios"],
    ["producao", "/producao"],
    ["feirantes", "/feiras"],
    ["administracao", "/estoque-principal"],
    [undefined, "/login"],
  ])("direciona %s para %s", (perfil, rota) => {
    expect(getRotaInicial(perfil)).toBe(rota);
  });
});

describe("perfilPodeAcessar", () => {
  it.each<[UserRole, string]>([
    ["dono", "/relatorios"],
    ["producao", "/estoque-cozinha"],
    ["feirantes", "/feiras"],
    ["administracao", "/estoque-principal"],
  ])("permite que %s acesse %s", (perfil, rota) => {
    expect(perfilPodeAcessar(perfil, rota)).toBe(true);
  });

  it.each(PERFIS)("permite que %s acesse o login", (perfil) => {
    expect(perfilPodeAcessar(perfil, "/login")).toBe(true);
  });

  it.each<[UserRole, string]>([
    ["producao", "/relatorios"],
    ["producao", "/equipe"],
    ["feirantes", "/producao"],
    ["feirantes", "/estoque-principal"],
    ["administracao", "/feiras"],
    ["administracao", "/estoque-cozinha"],
  ])("impede que %s acesse %s", (perfil, rota) => {
    expect(perfilPodeAcessar(perfil, rota)).toBe(false);
  });

  it("aplica a permissão também às subrotas", () => {
    expect(perfilPodeAcessar("dono", "/equipe/editar")).toBe(true);
    expect(perfilPodeAcessar("feirantes", "/feiras/gerenciar")).toBe(true);
    expect(perfilPodeAcessar("administracao", "/login/ajuda")).toBe(true);
  });

  it("rejeita uma rota que não foi cadastrada", () => {
    expect(perfilPodeAcessar("dono", "/rota-inexistente")).toBe(false);
  });

  it("não confunde caminhos apenas parecidos", () => {
    expect(perfilPodeAcessar("dono", "/feiras-falsa")).toBe(false);
  });
});
