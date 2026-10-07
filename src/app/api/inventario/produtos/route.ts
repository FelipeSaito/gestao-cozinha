import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";
import {
  calcularEntradaEstoque,
  dataValida,
  numero,
  situacao,
  texto,
} from "@/lib/estoque-calculos";
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

export async function POST(
  request: NextRequest,
) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
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

  const { auth, db } = firebaseAdmin();

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

            const calculoEntrada =
              calcularEntradaEstoque(
                saldoAnterior,
                anterior.custoUnitario,
                quantidade,
                custoUnitario,
              );

            saldoNovo =
              calculoEntrada.saldoNovo;

            transacao.update(
              existente.ref,
              {
                quantidade:
                  saldoNovo,
                custoUnitario:
                  calculoEntrada.custoMedio,
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