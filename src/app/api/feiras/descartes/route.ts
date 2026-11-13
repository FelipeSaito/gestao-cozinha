import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import {
  calcularNovoDescarteFeira,
  LIMITE_DESCARTE_POR_OPERACAO,
} from "@/lib/saldo-sobras-feira";

export const runtime = "nodejs";

const ORIGEM =
  /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+\|[a-zA-Z0-9-]+$/;

function falha(erro: string, status: number) {
  return NextResponse.json({ erro }, { status });
}

async function dono(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];

  if (!token) return null;

  const { auth, db } = firebaseAdmin();

  try {
    const uid = (await auth.verifyIdToken(token, true)).uid;
    const perfil = (
      await db.collection("perfis").doc(uid).get()
    ).data();

    if (
      perfil?.perfil === "dono" ||
      (
        Array.isArray(perfil?.perfis) &&
        perfil.perfis.includes("dono")
      )
    ) {
      return {
        uid,
        nome: typeof perfil?.nome === "string"
          ? perfil.nome
          : "Dono",
        db,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const acesso = await dono(request);

  if (!acesso) {
    return falha(
      "Somente o Dono pode consultar descartes e doações.",
      403,
    );
  }

  try {
    const snapshot = await acesso.db
      .collection("descartesFeira")
      .limit(5001)
      .get();

    if (snapshot.size > 5000) {
      return falha("Há muitos registros. Solicite paginação.", 413);
    }

    return NextResponse.json(
      {
        // Compatibilidade: quantidade inclui descarte e doação.
        descartes: snapshot.docs.map((documento) => ({
          origem: documento.id,
          quantidade: documento.data().quantidade,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return falha(
      "Não foi possível consultar descartes e doações.",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const acesso = await dono(request);

  if (!acesso) {
    return falha(
      "Somente o Dono pode registrar descartes e doações.",
      403,
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
  ) {
    return falha("Envie os dados em JSON.", 415);
  }

  let entrada: unknown;

  try {
    entrada = await request.json();
  } catch {
    return falha("Dados inválidos.", 400);
  }

  if (
    !entrada ||
    typeof entrada !== "object" ||
    Array.isArray(entrada)
  ) {
    return falha("Dados inválidos.", 400);
  }

  const dado = entrada as Record<string, unknown>;

  // Clientes antigos enviavam apenas descarte.
  const tipo = dado.tipo === undefined ? "descarte" : dado.tipo;

  if (tipo !== "descarte" && tipo !== "doacao") {
    return falha("Escolha descarte ou doação.", 400);
  }

  const motivo =
    typeof dado.motivo === "string" ? dado.motivo.trim() : "";

  const destinatario =
    typeof dado.destinatario === "string"
      ? dado.destinatario.trim()
      : "";

  if (
    typeof dado.operacaoId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dado.operacaoId) ||
    typeof dado.origem !== "string" ||
    !ORIGEM.test(dado.origem) ||
    typeof dado.quantidade !== "number" ||
    !Number.isSafeInteger(dado.quantidade) ||
    dado.quantidade <= 0 ||
    dado.quantidade > LIMITE_DESCARTE_POR_OPERACAO
  ) {
    return falha("Informe lote e quantidade válidos.", 400);
  }

  if (
    (tipo === "descarte" && motivo.length < 5) ||
    motivo.length > 200
  ) {
    return falha(
      "Para descarte, informe um motivo de 5 a 200 caracteres.",
      400,
    );
  }

  if (
    tipo === "doacao" &&
    (destinatario.length < 2 || destinatario.length > 120)
  ) {
    return falha(
      "Informe um destinatário de 2 a 120 caracteres.",
      400,
    );
  }

  const operacaoId = dado.operacaoId;
  const origem = dado.origem;
  const quantidade = dado.quantidade;
  const destino = tipo === "doacao" ? destinatario : "";

  const { db, uid, nome } = acesso;
  const separador = origem.lastIndexOf("|");
  const feira = origem.slice(0, separador);
  const saborId = origem.slice(separador + 1);

  const movimentoRef = db
    .collection("movimentosDescarteFeira")
    .doc(operacaoId);

  const descarteRef = db.collection("descartesFeira").doc(origem);
  const saldoRef = db.collection("saldoSobrasFeira").doc(origem);
  const fechamentoRef = db.collection("fechamentosFeira").doc(feira);

  try {
    const resultado = await db.runTransaction(async (tx) => {
      const [movimento, descarte, saldo, fechamento] =
        await Promise.all([
          tx.get(movimentoRef),
          tx.get(descarteRef),
          tx.get(saldoRef),
          tx.get(fechamentoRef),
        ]);

      if (movimento.exists) {
        const salvo = movimento.data();

        if (
          salvo?.origem !== origem ||
          salvo?.quantidade !== quantidade ||
          salvo?.motivo !== motivo ||
          (salvo?.tipo ?? "descarte") !== tipo ||
          (salvo?.destinatario ?? "") !== destino ||
          salvo?.registradoPorId !== uid
        ) {
          throw new Error("Identificador de operação já utilizado.");
        }

        return {
          repetida: true,
          total: descarte.data()?.quantidade ?? 0,
        };
      }

      const itens: unknown = fechamento.data()?.itens;

      if (!fechamento.exists || !Array.isArray(itens)) {
        throw new Error("Fechamento não encontrado.");
      }

      const item = itens.find(
        (valor: unknown) =>
          valor !== null &&
          typeof valor === "object" &&
          "saborId" in valor &&
          valor.saborId === saborId,
      ) as { sobraram?: unknown } | undefined;

      if (
        !item ||
        typeof item.sobraram !== "number" ||
        !Number.isSafeInteger(item.sobraram) ||
        item.sobraram < 0
      ) {
        throw new Error("Sobra não encontrada ou inválida.");
      }

      // Total de baixas: descartes + doações.
      // Mantém compatibilidade com todas as consultas de saldo atuais.
      const totalBaixado = descarte.exists
        ? descarte.data()?.quantidade
        : 0;

      const totalAlocado = saldo.exists
        ? saldo.data()?.totalAlocado
        : 0;

      const calculo = calcularNovoDescarteFeira(
        {
          totalSobras: item.sobraram,
          totalAlocado,
          totalDescartado: totalBaixado,
        },
        quantidade,
      );

      const agora = new Date();

      tx.create(movimentoRef, {
        origem,
        tipo,
        quantidade,
        motivo,
        destinatario: destino,
        registradoPorId: uid,
        registradoPor: nome,
        registradoEm: agora,
      });

      tx.set(descarteRef, {
        origem,
        quantidade: calculo.totalDescartado,
        atualizadoEm: agora,
      });

      if (fechamento.data()?.reaproveitado !== true) {
        tx.update(fechamentoRef, { reaproveitado: true });
      }

      return {
        repetida: false,
        total: calculo.totalDescartado,
      };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    return falha(
      erro instanceof Error
        ? erro.message
        : "Não foi possível registrar o movimento.",
      409,
    );
  }
}