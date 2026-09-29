"use client";

import { firebaseClient } from "@/lib/firebase";

export type FeiraCadastrada = {
  id: string;
  nome: string;
  tipo: "semanal" | "evento";
  responsaveis: string[];
  diaSemana: number | null;
  data: string | null;
  ativo: boolean;
  versao: number;
  desativadaEm: string | null;
  padrao: boolean;
  turno: string | null;
};

type NovaFeira = {
  id: string;
  nome: string;
  responsaveis: string[];
} & ({ tipo: "semanal"; diaSemana: number } | { tipo: "evento"; data: string });

export type EdicaoFeira = NovaFeira & { ativo: boolean; versao: number };

async function chamar<T>(method: "GET" | "POST" | "PUT" | "DELETE", dados?: NovaFeira | EdicaoFeira | { id: string; versao: number }): Promise<T> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para acessar as feiras.");
  const resposta = await fetch("/api/feiras-cadastradas", {
    method, cache: "no-store",
    headers: {
      Authorization: `Bearer ${await usuario.getIdToken()}`,
      ...(dados ? { "Content-Type": "application/json" } : {}),
    },
    ...(dados ? { body: JSON.stringify(dados) } : {}),
  });
  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" &&
      "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Não foi possível acessar as feiras.";
    throw new Error(mensagem);
  }
  return resultado as T;
}

export async function listarFeirasCadastradas() {
  const resposta = await chamar<{ feiras: FeiraCadastrada[] }>("GET");
  return resposta.feiras;
}

export async function cadastrarFeira(dados: NovaFeira) {
  return chamar<{ ok: true; id: string }>("POST", dados);
}

export async function editarFeira(dados: EdicaoFeira) {
  return chamar<{ ok: true; versao: number }>("PUT", dados);
}

export async function excluirFeira(id: string, versao: number) {
  return chamar<{ ok: true }>("DELETE", { id, versao });
}
