import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import {
  calcularNovoDescarteFeira,
  LIMITE_DESCARTE_POR_OPERACAO,
} from "@/lib/saldo-sobras-feira";

export const runtime = "nodejs";

const ORIGEM = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+\|[a-zA-Z0-9-]+$/;

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
    const perfil = (await db.collection("perfis").doc(uid).get()).data();

    if (
      perfil?.perfil === "dono" ||
      (Array.isArray(perfil?.perfis) && perfil.perfis.includes("dono"))
    ) {
      return {
        uid,
        nome: typeof perfil?.nome === "string" ? perfil.nome : "Dono",
        db,
      };
    }
  } catch {
    // Sessão inválida.
  }

  return null;
}

export async function GET(request: NextRequest) {
  const acesso = await dono(request);

  if (!acesso) {
    return falha("Somente o Dono pode consultar descartes.", 403);
  }

  try {
    const snapshot = await acesso.db
      .collection("descartesFeira")
      .limit(5000)
      .get();

    if (snapshot.size === 5000) {
      return falha("Há muitos registros. Solicite paginação.", 413);
    }

    return NextResponse.json({
      descartes: snapshot.docs.map((documento) => ({
        origem: documento.id,
        quantidade: documento.data().quantidade,
      })),
    });
  } catch {
    return falha("Não foi possível consultar descartes.", 500);
  }
}

export async function POST(request: NextRequest) {
  const acesso = await dono(request);

  if (!acesso) {
    return falha("Somente o Dono pode registrar descartes.", 403);
  }

  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return falha("Envie os dados em JSON.", 415);
  }

  let entrada: unknown;

  try {
    entrada = await request.json();
  } catch {
    return falha("Dados inválidos.", 400);
  }

  if (!entrada || typeof entrada !== "object") {
    return falha("Dados inválidos.", 400);
  }

  const dado = entrada as Record<string, unknown>;

  if (
    typeof dado.operacaoId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dado.operacaoId) ||
    typeof dado.origem !== "string" ||
    !ORIGEM.test(dado.origem) ||
    !Number.isSafeInteger(dado.quantidade) ||
    (dado.quantidade as number) <= 0 ||
    (dado.quantidade as number) > LIMITE_DESCARTE_POR_OPERACAO ||
    typeof dado.motivo !== "string" ||
    dado.motivo.trim().length < 5 ||
    dado.motivo.trim().length > 200
  ) {
    return falha("Informe lote, quantidade e motivo válidos.", 400);
  }

  const operacaoId = dado.operacaoId;
  const origem = dado.origem;
  const quantidade = dado.quantidade as number;
  const motivo = dado.motivo.trim();
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
      const [movimento, descarte, saldo, fechamento] = await Promise.all([
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
          salvo?.registradoPorId !== uid
        ) {
          throw new Error("Identificador de operação já utilizado.");
        }

        return {
          repetida: true,
          total: descarte.data()?.quantidade ?? 0,
        };
      }

      const item = fechamento
        .data()
        ?.itens?.find?.(
          (valor: { saborId?: string }) => valor.saborId === saborId,
        );

      if (!fechamento.exists || !item || !Number.isSafeInteger(item.sobraram)) {
        throw new Error("Fechamento ou sobra não encontrado.");
      }

      const totalDescartado = descarte.exists
        ? descarte.data()?.quantidade
        : 0;
      const totalAlocado = saldo.exists ? saldo.data()?.totalAlocado : 0;

      const calculo = calcularNovoDescarteFeira(
        {
          totalSobras: item.sobraram,
          totalAlocado,
          totalDescartado,
        },
        quantidade,
      );

      tx.create(movimentoRef, {
        origem,
        quantidade,
        motivo,
        registradoPorId: uid,
        registradoPor: nome,
        registradoEm: new Date(),
      });

      tx.set(descarteRef, {
        origem,
        quantidade: calculo.totalDescartado,
        atualizadoEm: new Date(),
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
        : "Não foi possível registrar o descarte.",
      409,
    );
  }
}
