import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";
import type { Product } from "@/types";

export const runtime = "nodejs";

type Entrada = {
  operacaoId?: unknown;
  nome?: unknown;
  categoria?: unknown;
  lote?: unknown;
  validade?: unknown;
  quantidade?: unknown;
  unidade?: unknown;
  custoUnitario?: unknown;
};

function falha(
  erro: string,
  status: number,
) {
  return NextResponse.json(
    { erro },
    { status },
  );
}

function texto(
  valor: unknown,
  maximo: number,
): valor is string {
  return (
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= maximo
  );
}

function numero(
  valor: unknown,
  casas: number,
  permiteZero: boolean,
): valor is number {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor > 1_000_000 ||
    (permiteZero
      ? valor < 0
      : valor <= 0)
  ) {
    return false;
  }

  const fator = 10 ** casas;

  return (
    Math.abs(
      valor * fator -
        Math.round(valor * fator),
    ) < 1e-7
  );
}

function dataValida(
  valor: unknown,
): valor is string {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      valor,
    )
  ) {
    return false;
  }

  const [ano, mes, dia] = valor
    .split("-")
    .map(Number);

  const data = new Date(
    Date.UTC(
      ano,
      mes - 1,
      dia,
    ),
  );

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

function hojeBrasil() {
  const partes =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(new Date());

  const campo = (tipo: string) =>
    partes.find(
      (parte) =>
        parte.type === tipo,
    )?.value;

  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}

function situacao(
  quantidade: number,
  validade: string,
): Product["situacao"] {
  const hoje = hojeBrasil();

  if (validade < hoje) {
    return "vencido";
  }

  const dias =
    (Date.parse(
      `${validade}T12:00:00Z`,
    ) -
      Date.parse(
        `${hoje}T12:00:00Z`,
      )) /
    86_400_000;

  if (dias <= 7) {
    return "proximo-vencimento";
  }

  if (quantidade <= 5) {
    return "estoque-baixo";
  }

  return "normal";
}

export async function POST(
  request: NextRequest,
) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith(
        "application/json",
      )
  ) {
    return falha(
      "Envie os dados em JSON.",
      415,
    );
  }

  const token =
    /^Bearer (\S+)$/.exec(
      request.headers.get(
        "authorization",
      ) ?? "",
    )?.[1];

  if (!token) {
    return falha(
      "Faça login para registrar uma entrada.",
      401,
    );
  }

  const { auth, db } =
    firebaseAdmin();

  let uid: string;

  try {
    uid = (
      await auth.verifyIdToken(
        token,
        true,
      )
    ).uid;
  } catch {
    return falha(
      "Sessão inválida.",
      401,
    );
  }

  try {
    const perfil = (
      await db
        .collection("perfis")
        .doc(uid)
        .get()
    ).data();

    const perfis = Array.isArray(
      perfil?.perfis,
    )
      ? perfil.perfis
      : [];

    const autorizado =
      perfil?.perfil === "dono" ||
      perfil?.perfil ===
        "administracao" ||
      perfis.includes("dono") ||
      perfis.includes(
        "administracao",
      );

    if (!autorizado) {
      return falha(
        "Você não tem permissão para registrar entradas.",
        403,
      );
    }

    let entrada: Entrada;

    try {
      entrada =
        await request.json();
    } catch {
      return falha(
        "Dados inválidos.",
        400,
      );
    }

    if (
      !entrada ||
      !texto(
        entrada.nome,
        120,
      ) ||
      !texto(
        entrada.categoria,
        80,
      ) ||
      !texto(
        entrada.lote,
        80,
      ) ||
      !texto(
        entrada.unidade,
        30,
      ) ||
      !dataValida(
        entrada.validade,
      ) ||
      !numero(
        entrada.quantidade,
        3,
        false,
      ) ||
      !numero(
        entrada.custoUnitario,
        4,
        true,
      ) ||
      typeof entrada.operacaoId !==
        "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(
        entrada.operacaoId,
      )
    ) {
      return falha(
        "Confira nome, categoria, lote, validade, quantidade e custo.",
        400,
      );
    }

    const nome =
      entrada.nome.trim();

    const categoria =
      entrada.categoria.trim();

    const lote =
      entrada.lote.trim();

    const unidade =
      entrada.unidade.trim();

    const validade =
      entrada.validade;

    const quantidade =
      entrada.quantidade;

    const custoUnitario =
      entrada.custoUnitario;

    const operacaoId =
      entrada.operacaoId;

    const movimentoRef = db
      .collection(
        "movimentacoesEstoque",
      )
      .doc(operacaoId);

    const produtoNovoRef = db
      .collection(
        "estoquePrincipal",
      )
      .doc();

    const resultado =
      await db.runTransaction(
        async (transacao) => {
          const [
            movimento,
            mesmoLote,
          ] = await Promise.all([
            transacao.get(
              movimentoRef,
            ),
            transacao.get(
              db
                .collection(
                  "estoquePrincipal",
                )
                .where(
                  "lote",
                  "==",
                  lote,
                ),
            ),
          ]);

          if (movimento.exists) {
            if (
              movimento.data()
                ?.registradoPorId !==
              uid
            ) {
              throw new Error(
                "Identificador de operação já utilizado.",
              );
            }

            return {
              id: movimento.data()
                ?.produtoId as string,
              repetida: true,
            };
          }

          const encontrados =
            mesmoLote.docs.filter(
              (documento) =>
                String(
                  documento.data()
                    .nome,
                )
                  .trim()
                  .toLocaleLowerCase(
                    "pt-BR",
                  ) ===
                nome.toLocaleLowerCase(
                  "pt-BR",
                ),
            );

          if (
            encontrados.length > 1
          ) {
            throw new Error(
              "Existem dois produtos com esse nome e lote; corrija o cadastro antes da entrada.",
            );
          }

          const existente =
            encontrados[0];

          let produtoId: string;
          let saldoAnterior = 0;
          let saldoNovo =
            quantidade;

          if (existente) {
            const anterior =
              existente.data() as Product;

            if (
              anterior.validade !==
                validade ||
              anterior.unidade !==
                unidade ||
              anterior.categoria !==
                categoria ||
              !Number.isFinite(
                anterior.quantidade,
              ) ||
              !Number.isFinite(
                anterior.custoUnitario,
              )
            ) {
              throw new Error(
                "O produto já existe com esse lote, mas os dados não correspondem.",
              );
            }

            produtoId =
              existente.id;

            saldoAnterior =
              anterior.quantidade;

            saldoNovo =
              Math.round(
                (saldoAnterior +
                  quantidade) *
                  1000,
              ) / 1000;

            const custoMedio =
              Math.round(
                ((saldoAnterior *
                  anterior.custoUnitario +
                  quantidade *
                    custoUnitario) /
                  saldoNovo) *
                  10_000,
              ) / 10_000;

            transacao.update(
              existente.ref,
              {
                quantidade:
                  saldoNovo,
                custoUnitario:
                  custoMedio,
                situacao: situacao(
                  saldoNovo,
                  validade,
                ),
              },
            );
          } else {
            produtoId =
              produtoNovoRef.id;

            transacao.create(
              produtoNovoRef,
              {
                nome,
                categoria,
                lote,
                validade,
                quantidade,
                unidade,
                custoUnitario,
                situacao: situacao(
                  quantidade,
                  validade,
                ),
              },
            );
          }

          transacao.create(
            movimentoRef,
            {
              produtoId,
              quantidade,
              saldoAnterior,
              saldoNovo,
              custoUnitario,
              lote,
              registradoPorId:
                uid,
              registradoEm:
                new Date(),
            },
          );

          return {
            id: produtoId,
            repetida: false,
          };
        },
      );

    return NextResponse.json({
      ok: true,
      ...resultado,
    });
  } catch (error) {
    return falha(
      error instanceof Error
        ? error.message
        : "Não foi possível registrar a entrada.",
      409,
    );
  }
}