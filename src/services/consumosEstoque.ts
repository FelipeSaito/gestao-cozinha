"use client";

import { firebaseClient } from "@/lib/firebase";

export interface RegistrarConsumo {
  operacaoId: string;
  produtoId: string;
  ordemId: string;
  quantidade: number;
  finalidade: string;
}

export interface ConsumoRegistrado {
  id: string;
  produtoId: string;
  ordemId: string | null;
  ordemCodigo: string | null;
  ordemPrato: string | null;
  nome: string;
  lote: string;
  unidade: string;
  quantidade: number;
  finalidade: string;
  custoUnitario: number | null;
  saldoAnterior: number;
  saldoNovo: number;
  registradoPor: string;
  registradoEm: string | null;
}

export async function consultarConsumosCozinha(): Promise<ConsumoRegistrado[]> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para consultar os consumos.");

  const resposta = await fetch("/api/inventario/consumos", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${await usuario.getIdToken()}` },
  });
  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" &&
      "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Não foi possível consultar os consumos.";
    throw new Error(mensagem);
  }
  if (!resultado || typeof resultado !== "object" ||
    !("consumos" in resultado) || !Array.isArray(resultado.consumos)) {
    throw new Error("Resposta inválida ao consultar os consumos.");
  }
  return resultado.consumos as ConsumoRegistrado[];
}

export async function consultarConsumosPorPeriodo(
  inicio: string, fim: string,
): Promise<ConsumoRegistrado[]> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para consultar os custos.");
  const parametros = new URLSearchParams({ inicio, fim });
  const resposta = await fetch(`/api/inventario/consumos?${parametros}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${await usuario.getIdToken()}` },
  });
  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" &&
      "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Não foi possível consultar os custos.";
    throw new Error(mensagem);
  }
  if (!resultado || typeof resultado !== "object" ||
    !("consumos" in resultado) || !Array.isArray(resultado.consumos)) {
    throw new Error("Resposta inválida ao consultar os custos.");
  }
  return resultado.consumos as ConsumoRegistrado[];
}

export async function consultarConsumosDaOrdem(ordemId: string): Promise<ConsumoRegistrado[]> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para consultar a ordem.");
  const resposta = await fetch(`/api/inventario/consumos?ordemId=${encodeURIComponent(ordemId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${await usuario.getIdToken()}` },
  });
  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" &&
      "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Não foi possível consultar a ordem.";
    throw new Error(mensagem);
  }
  if (!resultado || typeof resultado !== "object" ||
    !("consumos" in resultado) || !Array.isArray(resultado.consumos)) {
    throw new Error("Resposta inválida ao consultar a ordem.");
  }
  return resultado.consumos as ConsumoRegistrado[];
}

export async function registrarConsumoCozinha(dados: RegistrarConsumo) {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para registrar o consumo.");

  const resposta = await fetch("/api/inventario/consumos", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await usuario.getIdToken()}`,
    },
    body: JSON.stringify(dados),
  });

  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = resultado && typeof resultado === "object" &&
      "erro" in resultado && typeof resultado.erro === "string"
      ? resultado.erro : "Não foi possível registrar o consumo.";
    throw new Error(mensagem);
  }

  return resultado as { ok: true; saldoNovo: number; repetida: boolean };
}
