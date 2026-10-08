"use client";

import { firebaseClient } from "@/lib/firebase";
import type { ComplementoRelatorio } from "@/lib/relatorios";

export async function consultarComplementoRelatorio(
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<ComplementoRelatorio> {
  const { auth } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para consultar relatórios.");
  const token = await usuario.getIdToken();
  if (auth.currentUser?.uid !== usuario.uid) throw new Error("A sessão mudou.");
  const resposta = await fetch(`/api/relatorios?${new URLSearchParams({ inicio, fim })}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!resposta.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Resposta inesperada dos relatórios (HTTP ${resposta.status}).`);
  }
  const dados = await resposta.json();
  if (auth.currentUser?.uid !== usuario.uid) throw new Error("A sessão mudou.");
  if (!resposta.ok) throw new Error(dados?.erro ?? "Não foi possível consultar o relatório.");
  return dados as ComplementoRelatorio;
}
