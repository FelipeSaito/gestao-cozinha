"use client";

import { firebaseClient } from "@/lib/firebase";

export type DescartesFeira = Record<string, number>;

async function requisitar(method: "GET" | "POST", dados?: object) {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para consultar os descartes.");
  const resposta = await fetch("/api/feiras/descartes", {
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
      ? resultado.erro : "Não foi possível acessar os descartes.";
    throw new Error(mensagem);
  }
  return resultado;
}

export async function consultarDescartesFeira(): Promise<DescartesFeira> {
  const resultado = await requisitar("GET");
  if (!resultado || typeof resultado !== "object" ||
    !("descartes" in resultado) || !Array.isArray(resultado.descartes)) {
    throw new Error("Resposta inválida ao consultar descartes.");
  }
  const mapa: DescartesFeira = {};
  for (const registro of resultado.descartes) {
    if (registro && typeof registro === "object" &&
      typeof registro.origem === "string" &&
      Number.isSafeInteger(registro.quantidade) && registro.quantidade >= 0) {
      mapa[registro.origem] = registro.quantidade;
    }
  }
  return mapa;
}

export async function registrarDescarteFeira(
  origem: string, quantidade: number, motivo: string, operacaoId: string,
) {
  await requisitar("POST", { origem, quantidade, motivo, operacaoId });
}
