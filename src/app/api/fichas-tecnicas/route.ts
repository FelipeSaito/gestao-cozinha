import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import { lerPerfis } from "@/lib/permissoes";
import { validarFichaTecnica, type DadosFichaTecnica } from "@/lib/fichas-tecnicas";

export const runtime = "nodejs";
const COLECAO = "fichasTecnicas";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class Falha extends Error {
  constructor(mensagem: string, readonly status: number) { super(mensagem); }
}
function json(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { "Cache-Control": "private, no-store" } });
}
async function autorizar(request: NextRequest, escrita: boolean) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) throw new Falha("Faça login para acessar as fichas técnicas.", 401);
  const { auth, db } = firebaseAdmin();
  let uid: string;
  try { uid = (await auth.verifyIdToken(token, true)).uid; }
  catch { throw new Falha("Sessão inválida. Entre novamente.", 401); }
  const perfil = (await db.collection("perfis").doc(uid).get()).data();
  const perfis = perfil ? lerPerfis(perfil) : [];
  const permitidos = escrita ? ["dono", "administracao"] : ["dono", "administracao", "producao"];
  if (!perfis.some((item) => permitidos.includes(item))) throw new Falha("Você não tem permissão para esta operação.", 403);
  return { db, uid, nome: typeof perfil?.nome === "string" ? perfil.nome : "Funcionário" };
}
function responderErro(erro: unknown) {
  if (erro instanceof Falha) return json({ erro: erro.message }, erro.status);
  console.error("Falha nas fichas técnicas:", erro);
  return json({ erro: "Não foi possível acessar as fichas técnicas. Tente novamente." }, 500);
}
export async function GET(request: NextRequest) {
  try {
    const { db } = await autorizar(request, false);
    const snapshot = await db.collection(COLECAO).limit(1001).get();
    if (snapshot.size > 1000) throw new Falha("Há mais de 1.000 fichas. É necessário paginar a consulta.", 413);
    const fichas = snapshot.docs.map((doc) => {
      const salvo = doc.data();
      return { ...validarFichaTecnica(salvo), id: doc.id, versao: salvo.versao,
        atualizadoEm: salvo.atualizadoEm, atualizadoPor: salvo.atualizadoPor };
    }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return json({ fichas });
  } catch (erro) { return responderErro(erro); }
}
async function salvar(request: NextRequest, editar: boolean) {
  try {
    const pessoa = await autorizar(request, true);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Falha("Envie os dados em JSON.", 415);
    let corpo: Record<string, unknown>;
    try {
      const recebido: unknown = await request.json();
      if (!recebido || typeof recebido !== "object" || Array.isArray(recebido)) throw new Error();
      corpo = recebido as Record<string, unknown>;
    } catch { throw new Falha("Dados inválidos.", 400); }
    let dados: DadosFichaTecnica;
    try { dados = validarFichaTecnica(corpo.dados); }
    catch (erro) { throw new Falha(erro instanceof Error ? erro.message : "Ficha inválida.", 400); }
    const id = corpo.id;
    if (typeof id !== "string" || !uuid.test(id)) throw new Falha("Identificador inválido.", 400);
    if (editar && (typeof corpo.versao !== "number" || !Number.isSafeInteger(corpo.versao) || corpo.versao < 1)) {
      throw new Falha("Versão da ficha inválida.", 400);
    }
    const assinatura = createHash("sha256").update(JSON.stringify(dados)).digest("hex");
    const ref = pessoa.db.collection(COLECAO).doc(id);
    const resultado = await pessoa.db.runTransaction(async (transacao) => {
      const atual = await transacao.get(ref);
      const salvo = atual.data();
      if (!editar && atual.exists) {
        if (salvo?.criadoPorId !== pessoa.uid || salvo?.assinaturaCriacao !== assinatura) {
          throw new Falha("Identificador já utilizado por outra operação.", 409);
        }
        return { ...validarFichaTecnica(salvo), id, versao: salvo.versao,
          atualizadoEm: salvo.atualizadoEm, atualizadoPor: salvo.atualizadoPor };
      }
      if (editar && !atual.exists) throw new Falha("Ficha não encontrada.", 404);
      if (editar && salvo?.versao !== corpo.versao) {
        // Reconhece uma repetição após perda de resposta, sem gravar novamente.
        if (salvo?.versao === Number(corpo.versao) + 1 && salvo?.assinatura === assinatura && salvo?.atualizadoPorId === pessoa.uid) {
          return { ...dados, id, versao: salvo.versao, atualizadoEm: salvo.atualizadoEm, atualizadoPor: salvo.atualizadoPor };
        }
        throw new Falha("Esta ficha foi alterada. Recarregue a lista e abra a edição novamente.", 409);
      }
      const ficha = { ...dados, id, versao: editar ? Number(corpo.versao) + 1 : 1,
        atualizadoEm: new Date().toISOString(), atualizadoPor: pessoa.nome };
      const registro = { ...ficha, assinatura, atualizadoPorId: pessoa.uid };
      if (editar) transacao.update(ref, registro);
      else transacao.create(ref, { ...registro, criadoPorId: pessoa.uid, criadoEm: ficha.atualizadoEm, assinaturaCriacao: assinatura });
      return ficha;
    });
    return json({ ficha: resultado });
  } catch (erro) { return responderErro(erro); }
}
export async function POST(request: NextRequest) { return salvar(request, false); }
export async function PUT(request: NextRequest) { return salvar(request, true); }