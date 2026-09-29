"use client";

import { firebaseClient } from "@/lib/firebase";

export interface NovaEntrada {
  nome: string;
  categoria: string;
  lote: string;
  validade: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
}

export async function registrarEntrada(
  dados: NovaEntrada,
  operacaoId: string,
): Promise<{ ok: true; id: string; repetida: boolean }> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para registrar entradas.");

  const resposta = await fetch("/api/inventario/produtos", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await usuario.getIdToken()}`,
    },
    body: JSON.stringify({ ...dados, operacaoId }),
  });
  const resultado: unknown = await resposta.json();
  if (!resposta.ok) {
    throw new Error(
      resultado && typeof resultado === "object" && "erro" in resultado &&
      typeof resultado.erro === "string" ? resultado.erro : "Não foi possível registrar a entrada.",
    );
  }
  return resultado as { ok: true; id: string; repetida: boolean };
}
