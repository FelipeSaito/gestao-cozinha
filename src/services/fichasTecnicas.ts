"use client";
import { firebaseClient } from "@/lib/firebase";
import type { DadosFichaTecnica, FichaTecnica } from "@/lib/fichas-tecnicas";
async function requisitar<T>(metodo: "GET" | "POST" | "PUT", corpo?: object, signal?: AbortSignal): Promise<T> {
  const { auth } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para continuar.");
  const token = await usuario.getIdToken();
  if (auth.currentUser?.uid !== usuario.uid) throw new Error("A sessão mudou.");
  const resposta = await fetch("/api/fichas-tecnicas", {
    method: metodo, cache: "no-store", signal,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  if (!resposta.headers.get("content-type")?.includes("application/json")) throw new Error(`Resposta inesperada (HTTP ${resposta.status}).`);
  const dados = await resposta.json();
  if (auth.currentUser?.uid !== usuario.uid) throw new Error("A sessão mudou.");
  if (!resposta.ok) throw new Error(typeof dados?.erro === "string" ? dados.erro : "Não foi possível salvar a ficha.");
  return dados as T;
}
export async function listarFichasTecnicas(signal?: AbortSignal) {
  return (await requisitar<{ fichas: FichaTecnica[] }>("GET", undefined, signal)).fichas;
}
export async function salvarFichaTecnica(id: string, dados: DadosFichaTecnica, versao?: number) {
  return (await requisitar<{ ficha: FichaTecnica }>(versao === undefined ? "POST" : "PUT", { id, dados, versao })).ficha;
}