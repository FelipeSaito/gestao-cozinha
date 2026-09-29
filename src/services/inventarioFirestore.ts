"use client";

import { firebaseClient } from "@/lib/firebase";
import type { Product, Transfer } from "@/types";

export interface InventarioRemoto {
  produtos: Product[];
  estoqueCozinha: Product[];
  transferencias: Transfer[];
}

export interface ItemRecebido {
  itemId: string;
  quantidadeRecebida: number;
  recebidoCorretamente: boolean;
  observacao?: string;
}

async function requisitar<T>(
  method: "GET" | "POST",
  body?: object,
): Promise<T> {
  const usuario = firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Faça login para acessar o estoque.",
    );
  }

  const resposta = await fetch("/api/inventario", {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${await usuario.getIdToken()}`,
      ...(body
        ? { "Content-Type": "application/json" }
        : {}),
    },
    ...(body
      ? { body: JSON.stringify(body) }
      : {}),
  });

  const dados: unknown = await resposta.json();

  if (!resposta.ok) {
    const mensagem =
      dados &&
      typeof dados === "object" &&
      "erro" in dados &&
      typeof dados.erro === "string"
        ? dados.erro
        : "Erro ao acessar o estoque.";

    throw new Error(mensagem);
  }

  return dados as T;
}

export function buscarInventario() {
  return requisitar<InventarioRemoto>("GET");
}

export function inicializarEstoqueExemplo() {
  return requisitar<{ ok: true }>("POST", {
    acao: "inicializarExemplos",
  });
}

export function enviarTransferencia(
  produtoId: string,
  quantidade: number,
  observacao?: string,
) {
  return requisitar<{ ok: true; id: string }>(
    "POST",
    {
      acao: "criar",
      produtoId,
      quantidade,
      observacao,
    },
  );
}

export function receberTransferencia(
  transferenciaId: string,
  itens: ItemRecebido[],
) {
  return requisitar<{ ok: true }>("POST", {
    acao: "receber",
    transferenciaId,
    itens,
  });
}

export function cancelarTransferencia(
  transferenciaId: string,
) {
  return requisitar<{ ok: true }>("POST", {
    acao: "cancelar",
    transferenciaId,
  });
}