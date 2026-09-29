import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import type { Product } from "@/types";

export const runtime = "nodejs";

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

async function identificar(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const { auth, db } = firebaseAdmin();
  try {
    const uid = (await auth.verifyIdToken(token, true)).uid;
    const dados = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(dados?.perfis) ? dados.perfis : [];
    if (!([dados?.perfil, ...perfis].some((perfil) =>
      perfil === "dono" || perfil === "administracao"))) return null;
    return { uid, nome: typeof dados?.nome === "string" ? dados.nome : "Funcionário", db };
  } catch { return null; }
}

const idValido = (valor: unknown): valor is string =>
  typeof valor === "string" && /^[a-zA-Z0-9-]{1,150}$/.test(valor);

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const obter = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value;
  return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function situacao(quantidade: number, validade: string): Product["situacao"] {
  if (validade < hojeBrasil()) return "vencido";
  const dias = (Date.parse(`${validade}T12:00:00Z`) - Date.parse(`${hojeBrasil()}T12:00:00Z`)) / 86400000;
  if (dias <= 7) return "proximo-vencimento";
  return quantidade <= 5 ? "estoque-baixo" : "normal";
}

export async function GET(request: NextRequest) {
  const pessoa = await identificar(request);
  if (!pessoa) return erro("Acesso negado.", 403);
  const produtoId = request.nextUrl.searchParams.get("produtoId");
  if (!idValido(produtoId)) return erro("Produto inválido.", 400);
  try {
    // A coleção de entradas existente já usa produtoId e registradoEm.
    const registros = await pessoa.db.collection("movimentacoesEstoque")
      .where("produtoId", "==", produtoId).get();
    const movimentos = registros.docs.map((doc) => {
      const dado = doc.data();
      const instante = dado.registradoEm?.toDate?.() ?? new Date(dado.registradoEm ?? 0);
      return {
        id: doc.id, tipo: dado.tipo ?? "entrada", quantidade: dado.quantidade,
        saldoAnterior: dado.saldoAnterior, saldoNovo: dado.saldoNovo,
        justificativa: dado.justificativa ?? null,
        transferenciaId: dado.transferenciaId ?? null,
        registradoPor: dado.registradoPor ?? dado.registradoPorId ?? "—",
        registradoEm: Number.isNaN(instante.getTime()) ? null : instante.toISOString(),
      };
    }).sort((a, b) => (b.registradoEm ?? "").localeCompare(a.registradoEm ?? ""));
    return NextResponse.json({ movimentos });
  } catch {
    return erro("Não foi possível carregar o histórico.", 500);
  }
}

export async function POST(request: NextRequest) {
  const pessoa = await identificar(request);
  if (!pessoa) return erro("Acesso negado.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return erro("Envie os dados em JSON.", 415);
  let dados: Record<string, unknown>;
  try { dados = await request.json(); } catch { return erro("Dados inválidos.", 400); }
  const novoSaldo = dados?.novoSaldo;
  const saldoEsperado = dados?.saldoEsperado;
  const justificativa = typeof dados?.justificativa === "string" ? dados.justificativa.trim() : "";
  if (!idValido(dados?.produtoId) || !idValido(dados?.operacaoId) ||
    typeof novoSaldo !== "number" || !Number.isFinite(novoSaldo) ||
    novoSaldo < 0 || novoSaldo > 1_000_000 ||
    Math.abs(novoSaldo * 1000 - Math.round(novoSaldo * 1000)) > 1e-7 ||
    typeof saldoEsperado !== "number" || !Number.isFinite(saldoEsperado) ||
    justificativa.length < 10 || justificativa.length > 500) {
    return erro("Informe produto, novo saldo e justificativa de 10 a 500 caracteres.", 400);
  }
  const produtoRef = pessoa.db.collection("estoquePrincipal").doc(dados.produtoId);
  const movimentoRef = pessoa.db.collection("movimentacoesEstoque").doc(dados.operacaoId);
  try {
    const resultado = await pessoa.db.runTransaction(async (tx) => {
      const [movimento, snapshot] = await Promise.all([tx.get(movimentoRef), tx.get(produtoRef)]);
      if (movimento.exists) {
        const anterior = movimento.data();
        if (anterior?.tipo !== "correcao" || anterior?.produtoId !== dados.produtoId ||
          anterior?.registradoPorId !== pessoa.uid || anterior?.saldoNovo !== novoSaldo ||
          anterior?.saldoAnterior !== saldoEsperado || anterior?.justificativa !== justificativa)
          throw new Error("Identificador de operação já utilizado.");
        return { repetida: true };
      }
      if (!snapshot.exists) throw new Error("Produto não encontrado.");
      const produto = snapshot.data() as Product;
      if (!Number.isFinite(produto.quantidade) || produto.quantidade !== saldoEsperado)
        throw new Error("O saldo mudou. Atualize a tela e confira o valor antes de corrigir.");
      if (novoSaldo === saldoEsperado) throw new Error("O novo saldo deve ser diferente do saldo atual.");
      tx.update(produtoRef, { quantidade: novoSaldo, situacao: situacao(novoSaldo, produto.validade) });
      tx.create(movimentoRef, {
        tipo: "correcao", produtoId: snapshot.id, lote: produto.lote,
        quantidade: Math.round((novoSaldo - saldoEsperado) * 1000) / 1000,
        saldoAnterior: saldoEsperado, saldoNovo: novoSaldo, justificativa,
        registradoPorId: pessoa.uid, registradoPor: pessoa.nome, registradoEm: new Date(),
      });
      return { repetida: false };
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : "Não foi possível corrigir o saldo.", 409);
  }
}
