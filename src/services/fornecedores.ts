"use client";

import { firebaseClient } from "@/lib/firebase";

export interface Fornecedor {
  id: string;
  nome: string;
  documento: string;
  contato: string;
  telefone: string;
  produtos: string;
  ativo: boolean;
  versao: number;
}

export type DadosFornecedor = Omit<
  Fornecedor,
  "id" | "versao"
>;

type Metodo = "GET" | "POST" | "PUT";

async function requisitar<T>(
  metodo: Metodo,
  dados?: object,
): Promise<T> {
  const usuario =
    firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Entre com sua conta para acessar os fornecedores.",
    );
  }

  const resposta = await fetch(
    "/api/fornecedores",
    {
      method: metodo,
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${await usuario.getIdToken()}`,
        ...(dados
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },
      ...(dados
        ? {
            body: JSON.stringify(
              dados,
            ),
          }
        : {}),
    },
  );

  const resultado: unknown =
    await resposta.json();

  if (!resposta.ok) {
    const mensagem =
      resultado &&
      typeof resultado === "object" &&
      "erro" in resultado &&
      typeof resultado.erro ===
        "string"
        ? resultado.erro
        : "Não foi possível acessar os fornecedores.";

    throw new Error(mensagem);
  }

  return resultado as T;
}

export async function listarFornecedores(): Promise<
  Fornecedor[]
> {
  const resultado = await requisitar<{
    fornecedores: Fornecedor[];
  }>("GET");

  return resultado.fornecedores;
}

export async function cadastrarFornecedor(
  operacaoId: string,
  dados: DadosFornecedor,
): Promise<{
  id: string;
  versao: number;
  repetida: boolean;
}> {
  const resultado = await requisitar<{
    ok: true;
    id: string;
    versao: number;
    repetida: boolean;
  }>("POST", {
    operacaoId,
    ...dados,
  });

  return {
    id: resultado.id,
    versao: resultado.versao,
    repetida: resultado.repetida,
  };
}

export async function editarFornecedor(
  id: string,
  versao: number,
  dados: DadosFornecedor,
): Promise<{
  id: string;
  versao: number;
}> {
  const resultado = await requisitar<{
    ok: true;
    id: string;
    versao: number;
  }>("PUT", {
    id,
    versao,
    ...dados,
  });

  return {
    id: resultado.id,
    versao: resultado.versao,
  };
}