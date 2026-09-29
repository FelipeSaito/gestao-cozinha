import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import type { Product } from "@/types";

export const runtime = "nodejs";

type Consumo = {
  operacaoId?: unknown;
  produtoId?: unknown;
  ordemId?: unknown;
  quantidade?: unknown;
  finalidade?: unknown;
};

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function situacao(quantidade: number, validade: string): Product["situacao"] {
  const hoje = hojeBrasil();
  if (validade < hoje) return "vencido";
  const dias = (Date.parse(`${validade}T12:00:00Z`) -
    Date.parse(`${hoje}T12:00:00Z`)) / 86400000;
  if (dias <= 7) return "proximo-vencimento";
  return quantidade <= 5 ? "estoque-baixo" : "normal";
}

export async function GET(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return erro("Faça login para consultar os consumos.", 401);

  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return erro("Sessão inválida.", 401);
  }

  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!(perfil?.perfil === "dono" || perfil?.perfil === "producao" ||
      perfis.includes("dono") || perfis.includes("producao"))) {
      return erro("Você não tem permissão para consultar os consumos.", 403);
    }

    const ordemId = request.nextUrl.searchParams.get("ordemId");
    if (ordemId && !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(ordemId)) {
      return erro("Ordem inválida.", 400);
    }
    const consulta = ordemId
      ? await db.collection("consumosEstoqueCozinha")
        .where("ordemId", "==", ordemId).get()
      : await db.collection("consumosEstoqueCozinha")
        .orderBy("registradoEm", "desc").limit(30).get();

    const consumos = consulta.docs.map((documento) => {
      const dados = documento.data();
      return {
        id: documento.id,
        produtoId: dados.produtoId,
        ordemId: dados.ordemId ?? null,
        ordemCodigo: dados.ordemCodigo ?? null,
        ordemPrato: dados.ordemPrato ?? null,
        nome: dados.nome,
        lote: dados.lote,
        unidade: dados.unidade,
        quantidade: dados.quantidade,
        finalidade: dados.finalidade,
        saldoAnterior: dados.saldoAnterior,
        saldoNovo: dados.saldoNovo,
        registradoPor: dados.registradoPor,
        registradoEm: dados.registradoEm?.toDate?.().toISOString() ?? null,
      };
    });

    consumos.sort((a, b) => (b.registradoEm ?? "").localeCompare(a.registradoEm ?? ""));
    return NextResponse.json({ consumos: consumos.slice(0, 30) });
  } catch {
    return erro("Não foi possível consultar os consumos.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return erro("Envie os dados em JSON.", 415);
  }

  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return erro("Faça login para registrar um consumo.", 401);

  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return erro("Sessão inválida.", 401);
  }

  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!(perfil?.perfil === "dono" || perfil?.perfil === "producao" ||
      perfis.includes("dono") || perfis.includes("producao"))) {
      return erro("Você não tem permissão para registrar consumos.", 403);
    }

    let dados: Consumo;
    try { dados = await request.json(); }
    catch { return erro("Dados inválidos.", 400); }

    if (!dados || typeof dados.operacaoId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.operacaoId) ||
      typeof dados.produtoId !== "string" ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(dados.produtoId) ||
      typeof dados.ordemId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.ordemId) ||
      typeof dados.quantidade !== "number" ||
      !Number.isFinite(dados.quantidade) || dados.quantidade <= 0 ||
      dados.quantidade > 1000000 ||
      Math.abs(dados.quantidade * 1000 - Math.round(dados.quantidade * 1000)) > 1e-7 ||
      typeof dados.finalidade !== "string" ||
      dados.finalidade.trim().length < 3 || dados.finalidade.trim().length > 200) {
      return erro("Informe ordem de produção, produto, quantidade e finalidade válidos.", 400);
    }

    const { operacaoId, produtoId, ordemId, quantidade } = dados;
    const finalidade = dados.finalidade.trim();
    const produtoRef = db.collection("estoqueCozinha").doc(produtoId);
    const movimentoRef = db.collection("consumosEstoqueCozinha").doc(operacaoId);
    const ordemRef = db.collection("ordensProducao").doc(ordemId);

    const resultado = await db.runTransaction(async (tx) => {
      const [movimento, produtoSnap, ordemSnap] = await Promise.all([
        tx.get(movimentoRef), tx.get(produtoRef), tx.get(ordemRef),
      ]);

      if (movimento.exists) {
        const salvo = movimento.data();
        if (salvo?.registradoPorId !== uid || salvo?.produtoId !== produtoId ||
          salvo?.ordemId !== ordemId ||
          salvo?.quantidade !== quantidade || salvo?.finalidade !== finalidade) {
          throw new Error("Identificador de operação já utilizado com outros dados.");
        }
        return { saldoNovo: salvo.saldoNovo as number, repetida: true };
      }

      if (!produtoSnap.exists) throw new Error("Ingrediente não encontrado no estoque da cozinha.");
      if (!ordemSnap.exists || ordemSnap.data()?.status !== "em-andamento") {
        throw new Error("Selecione uma ordem de produção em preparo.");
      }
      const produto = produtoSnap.data() as Product;
      const ordem = ordemSnap.data();
      if (!Number.isFinite(produto.quantidade) || produto.quantidade < quantidade) {
        throw new Error("Quantidade maior que o saldo da cozinha.");
      }
      if (typeof produto.validade !== "string" || produto.validade < hojeBrasil()) {
        throw new Error("Ingrediente vencido não pode ser usado na produção.");
      }

      const saldoAnterior = produto.quantidade;
      const saldoNovo = Math.round((saldoAnterior - quantidade) * 1000) / 1000;
      tx.update(produtoRef, { quantidade: saldoNovo, situacao: situacao(saldoNovo, produto.validade) });
      tx.create(movimentoRef, {
        produtoId, nome: produto.nome, lote: produto.lote,
        ordemId, ordemCodigo: ordem?.codigo, ordemPrato: ordem?.prato,
        unidade: produto.unidade, quantidade, finalidade,
        saldoAnterior, saldoNovo, registradoPorId: uid,
        registradoPor: typeof perfil?.nome === "string" ? perfil.nome : "Funcionário",
        registradoEm: new Date(),
      });

      return { saldoNovo, repetida: false };
    });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : "Não foi possível registrar o consumo.", 409);
  }
}
