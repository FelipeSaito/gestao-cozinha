"use client";

import { firebaseClient } from "@/lib/firebase";

import type {
  Production,
  ProductionStatus,
  ResultadoProducaoMassa,
} from "@/types";

type CriarOrdem = Pick<
  Production,
  "prato" | "categoria" | "quantidade" | "unidade" | "insumos"
>;

export type EtapaMassa =
  | "planejamento"
  | "mistura"
  | "formacao-blocos"
  | "esticamento"
  | "enrolamento"
  | "armazenamento"
  | "concluida";

export type LocalMassa =
  | "freezer-1"
  | "freezer-2"
  | "freezer-3"
  | "freezer-4";

export type SacosPorLocal = Partial<
  Record<LocalMassa, number>
>;

export type OrdemRemota = Production & {
  etapaMassa?: EtapaMassa;
  locaisArmazenamento?: LocalMassa[];
  sacosPorLocal?: SacosPorLocal;
  sacosRetiradosPorLocal?: SacosPorLocal;
  totalSacos?: number;
  totalRolos?: number;
  resultadoMassa?: ResultadoProducaoMassa;
  alteradoPor?: string;
};

export interface RespostaAvancarOrdem {
  ok: true;
  status: ProductionStatus;
  etapaMassa: EtapaMassa | null;
  alteradoPor: string;
  resultadoMassa?: ResultadoProducaoMassa;
}

async function solicitar<T>(
  method: "GET" | "POST",
  body?: object,
): Promise<T> {
  const usuario =
    firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Faça login para acessar a produção.",
    );
  }

  const resposta = await fetch(
    "/api/ordens-producao",
    {
      method,
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${await usuario.getIdToken()}`,

        ...(body
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      ...(body
        ? {
            body: JSON.stringify(body),
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
      typeof resultado.erro === "string"
        ? resultado.erro
        : "Não foi possível acessar a produção.";

    throw new Error(mensagem);
  }

  return resultado as T;
}

export async function listarOrdens(): Promise<
  OrdemRemota[]
> {
  const dados = await solicitar<{
    ordens: OrdemRemota[];
  }>("GET");

  return dados.ordens;
}

export async function criarOrdem(
  operacaoId: string,
  dados: CriarOrdem,
): Promise<OrdemRemota> {
  const resposta = await solicitar<{
    ok: true;
    ordem: OrdemRemota;
  }>("POST", {
    acao: "criar",
    operacaoId,
    ...dados,
  });

  return resposta.ordem;
}

/**
 * Avança uma ordem para a próxima etapa.
 *
 * Ao concluir a etapa de armazenamento,
 * também pode enviar:
 *
 * - locais utilizados;
 * - quantidade de sacos por freezer;
 * - quantidade de blocos produzidos.
 */
export async function avancarOrdem(
  id: string,
  statusAtual: ProductionStatus,
  locaisArmazenamento?: LocalMassa[],
  sacosPorLocal?: SacosPorLocal,
  quantidadeBlocos?: number,
): Promise<RespostaAvancarOrdem> {
  return solicitar<RespostaAvancarOrdem>(
    "POST",
    {
      acao: "avancar",
      id,
      statusAtual,

      ...(locaisArmazenamento
        ? {
            locaisArmazenamento,
          }
        : {}),

      ...(sacosPorLocal
        ? {
            sacosPorLocal,
          }
        : {}),

      ...(quantidadeBlocos !== undefined
        ? {
            quantidadeBlocos,
          }
        : {}),
    },
  );
}

export async function retirarSacos(
  operacaoId: string,
  ordemId: string,
  local: LocalMassa,
  sacos: number,
): Promise<{
  saldo: number;
  repetida: boolean;
}> {
  const usuario =
    firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Faça login para retirar sacos.",
    );
  }

  const resposta = await fetch(
    "/api/ordens-producao/retiradas",
    {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${await usuario.getIdToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operacaoId,
        ordemId,
        local,
        sacos,
      }),
    },
  );

  const dados: unknown =
    await resposta.json();

  if (!resposta.ok) {
    const mensagem =
      dados &&
      typeof dados === "object" &&
      "erro" in dados &&
      typeof dados.erro === "string"
        ? dados.erro
        : "Não foi possível retirar os sacos.";

    throw new Error(mensagem);
  }

  return dados as {
    saldo: number;
    repetida: boolean;
  };
}

export async function consultarSaldoFreezers(): Promise<
  Record<LocalMassa, number>
> {
  const usuario =
    firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Faça login para consultar os freezers.",
    );
  }

  const resposta = await fetch(
    "/api/ordens-producao/saldo-freezers",
    {
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${await usuario.getIdToken()}`,
      },
    },
  );

  const dados: unknown =
    await resposta.json();

  if (!resposta.ok) {
    const mensagem =
      dados &&
      typeof dados === "object" &&
      "erro" in dados &&
      typeof dados.erro === "string"
        ? dados.erro
        : "Não foi possível consultar os freezers.";

    throw new Error(mensagem);
  }

  return (
    dados as {
      saldos: Record<LocalMassa, number>;
    }
  ).saldos;
}

export interface RetiradaMassa {
  id: string;
  ordemId: string;
  local: LocalMassa;
  sacos: number;
  rolos: number;
  retiradoPor: string;
  retiradoEm: string | null;
}

export async function listarRetiradasMassa(): Promise<
  RetiradaMassa[]
> {
  const usuario =
    firebaseClient().auth.currentUser;

  if (!usuario) {
    throw new Error(
      "Faça login para consultar as retiradas.",
    );
  }

  const resposta = await fetch(
    "/api/ordens-producao/retiradas",
    {
      cache: "no-store",
      headers: {
        Authorization:
          `Bearer ${await usuario.getIdToken()}`,
      },
    },
  );

  const dados: unknown =
    await resposta.json();

  if (!resposta.ok) {
    const mensagem =
      dados &&
      typeof dados === "object" &&
      "erro" in dados &&
      typeof dados.erro === "string"
        ? dados.erro
        : "Não foi possível carregar as retiradas.";

    throw new Error(mensagem);
  }

  return (
    dados as {
      retiradas: RetiradaMassa[];
    }
  ).retiradas;
}