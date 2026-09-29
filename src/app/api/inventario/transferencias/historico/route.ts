import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return NextResponse.json({ erro: "Faça login para consultar transferências." }, { status: 401 });

  const { auth, db } = firebaseAdmin();
  let uid: string;
  try { uid = (await auth.verifyIdToken(token, true)).uid; }
  catch { return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 }); }

  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (![perfil?.perfil, ...perfis].some((p) =>
      p === "dono" || p === "administracao" || p === "producao")) {
      return NextResponse.json({ erro: "Acesso negado." }, { status: 403 });
    }

    // Inclui documentos antigos, mesmo quando o campo de encerramento varia.
    const snapshot = await db.collection("transferenciasEstoque")
      .where("status", "in", ["conferida", "divergencia", "cancelada"]).get();
    const transferencias = snapshot.docs.map((doc) => {
      const dado = doc.data();
      const data = dado.recebidoEm?.toDate?.() ?? dado.canceladoEm?.toDate?.();
      return {
        id: doc.id,
        codigo: dado.codigo ?? doc.id,
        status: dado.status,
        criadaEm: dado.criadaEm ?? null,
        encerradaEm: data instanceof Date ? data.toISOString() : null,
        responsavel: dado.responsavel ?? "—",
        recebidoPor: dado.recebidoPor ?? null,
        canceladoPorId: dado.canceladoPorId ?? null,
        observacao: dado.observacao ?? null,
        itens: Array.isArray(dado.itens) ? dado.itens.map((item: Record<string, unknown>) => ({
          id: item.id, nome: item.nome, lote: item.lote,
          unidade: item.unidade, quantidadeEnviada: item.quantidadeEnviada,
        })) : [],
        recebimento: Array.isArray(dado.recebimento) ? dado.recebimento.map((item: Record<string, unknown>) => ({
          itemId: item.itemId, quantidadeRecebida: item.quantidadeRecebida,
          observacao: item.observacao ?? "",
          recebidoCorretamente: item.recebidoCorretamente,
        })) : [],
      };
    }).sort((a, b) => (b.encerradaEm ?? b.criadaEm ?? "")
      .localeCompare(a.encerradaEm ?? a.criadaEm ?? ""));

    return NextResponse.json({ transferencias });
  } catch {
    return NextResponse.json({ erro: "Não foi possível carregar o histórico de transferências." }, { status: 500 });
  }
}
