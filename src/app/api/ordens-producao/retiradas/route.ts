import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";
const LOCAIS = ["freezer-1", "freezer-2", "freezer-3", "freezer-4"] as const;

type Retirada = {
  operacaoId?: unknown;
  ordemId?: unknown;
  local?: unknown;
  sacos?: unknown;
};

function falha(erro: string, status: number) {
  return NextResponse.json({ erro }, { status });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return falha("Envie os dados em JSON.", 415);
  }
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return falha("Faça login para retirar sacos.", 401);

  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return falha("Sessão inválida.", 401);
  }

  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis: unknown[] = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!["dono", "producao"].some((p) => perfil?.perfil === p || perfis.includes(p))) {
      return falha("Sem permissão para retirar sacos.", 403);
    }

    let dados: Retirada;
    try { dados = await request.json(); }
    catch { return falha("Dados inválidos.", 400); }
    if (!dados || typeof dados.operacaoId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.operacaoId) ||
      typeof dados.ordemId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.ordemId) ||
      typeof dados.local !== "string" ||
      !LOCAIS.some((local) => local === dados.local) ||
      typeof dados.sacos !== "number" || !Number.isSafeInteger(dados.sacos) ||
      dados.sacos < 1 || dados.sacos > 100000) {
      return falha("Informe ordem, lado do freezer e sacos inteiros.", 400);
    }

    const { operacaoId, ordemId, local, sacos } = dados as {
      operacaoId: string; ordemId: string; local: string; sacos: number;
    };
    const ordemRef = db.collection("ordensProducao").doc(ordemId);
    const retiradaRef = db.collection("retiradasMassa").doc(operacaoId);
    const resultado = await db.runTransaction(async (tx) => {
      const [retirada, ordem] = await Promise.all([tx.get(retiradaRef), tx.get(ordemRef)]);
      if (retirada.exists) {
        const anterior = retirada.data();
        if (anterior?.ordemId !== ordemId || anterior?.local !== local ||
          anterior?.sacos !== sacos || anterior?.retiradoPorId !== uid) {
          throw new Error("Identificador de operação já utilizado.");
        }
        return { saldo: anterior.saldoDepois as number, repetida: true };
      }
      if (!ordem.exists || ordem.data()?.status !== "concluida" ||
        ordem.data()?.etapaMassa !== "concluida") {
        throw new Error("Ordem de massa concluída não encontrada.");
      }
      const salvo = ordem.data();
      const guardados = salvo?.sacosPorLocal?.[local];
      const retirados = salvo?.sacosRetiradosPorLocal?.[local] ?? 0;
      if (!Number.isSafeInteger(guardados) || guardados < 0 ||
        !Number.isSafeInteger(retirados) || retirados < 0 || retirados > guardados) {
        throw new Error("Esta ordem não tem saldo válido nesse lado do freezer.");
      }
      const saldo = guardados - retirados;
      if (sacos > saldo) throw new Error(`Saldo insuficiente: ${saldo} saco(s) disponível(is).`);
      const saldoDepois = saldo - sacos;
      tx.update(ordemRef, { [`sacosRetiradosPorLocal.${local}`]: retirados + sacos });
      tx.create(retiradaRef, {
        ordemId, local, sacos, rolos: sacos * 3,
        saldoAntes: saldo, saldoDepois,
        retiradoPorId: uid,
        retiradoPor: typeof perfil?.nome === "string" && perfil.nome.trim()
          ? perfil.nome.trim() : "Funcionário",
        retiradoEm: new Date(),
      });
      return { saldo: saldoDepois, repetida: false };
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (erro) {
    return falha(erro instanceof Error ? erro.message : "Não foi possível registrar a retirada.", 409);
  }
}

export async function GET(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return falha("Faça login para consultar as retiradas.", 401);
  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return falha("Sessão inválida.", 401);
  }
  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis: unknown[] = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!["dono", "producao"].some((p) => perfil?.perfil === p || perfis.includes(p))) {
      return falha("Sem permissão para consultar as retiradas.", 403);
    }
    const consulta = await db.collection("retiradasMassa")
      .orderBy("retiradoEm", "desc").limit(30).get();
    const retiradas = consulta.docs.map((doc) => {
      const dado = doc.data();
      return {
        id: doc.id,
        ordemId: dado.ordemId,
        local: dado.local,
        sacos: dado.sacos,
        rolos: dado.rolos,
        retiradoPor: dado.retiradoPor,
        retiradoEm: dado.retiradoEm?.toDate?.().toISOString() ?? null,
      };
    });
    return NextResponse.json({ retiradas });
  } catch {
    return falha("Não foi possível carregar o histórico de retiradas.", 500);
  }
}
