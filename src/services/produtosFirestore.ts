"use client";

import { firebaseClient } from "@/lib/firebase";

export interface NovoProduto {
  nome: string;
  categoria: string;
  lote: string;
  validade: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
}

export async function cadastrarProduto(produto: NovoProduto): Promise<string> {
  const usuario = firebaseClient().auth.currentUser;
  if (!usuario) throw new Error("Faça login para registrar produtos.");

  const resposta = await fetch("/api/inventario/produtos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await usuario.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(produto),
  });

  const dados: unknown = await resposta.json();
  if (!resposta.ok) {
    const mensagem = dados && typeof dados === "object" && "erro" in dados &&
      typeof dados.erro === "string" ? dados.erro : "Não foi possível registrar o produto.";
    throw new Error(mensagem);
  }

  if (!dados || typeof dados !== "object" || !("id" in dados) || typeof dados.id !== "string") {
    throw new Error("O servidor não confirmou o cadastro do produto.");
  }
  return dados.id;
}
