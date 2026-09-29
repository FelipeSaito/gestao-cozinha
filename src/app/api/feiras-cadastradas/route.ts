import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import { FEIRAS_PADRAO, feiraPadraoPorId } from "@/lib/feiras-padrao";

export const runtime = "nodejs";

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

async function identidade(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const { auth, db } = firebaseAdmin();
  try {
    const uid = (await auth.verifyIdToken(token, true)).uid;
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    return { uid, dono: perfil?.perfil === "dono" || perfis.includes("dono"),
      podeVer: ["dono", "producao", "feirantes"].some((p) =>
        perfil?.perfil === p || perfis.includes(p)) };
  } catch { return null; }
}

type Entrada = { id?: unknown; nome?: unknown; tipo?: unknown;
  diaSemana?: unknown; data?: unknown; responsaveis?: unknown };

function cadastroValido(dados: Entrada): boolean {
  return typeof dados.nome === "string" && !!dados.nome.trim() && dados.nome.trim().length <= 100 &&
    (dados.tipo === "semanal" || dados.tipo === "evento") &&
    Array.isArray(dados.responsaveis) && dados.responsaveis.length <= 10 &&
    dados.responsaveis.every((p) => typeof p === "string" && !!p.trim() && p.trim().length <= 80) &&
    (dados.tipo === "semanal"
      ? Number.isInteger(dados.diaSemana) && (dados.diaSemana as number) >= 0 && (dados.diaSemana as number) <= 6
      : dataValida(dados.data));
}

function dataValida(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (campo: string) => partes.find((parte) => parte.type === campo)!.value;
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export async function GET(request: NextRequest) {
  const pessoa = await identidade(request);
  if (!pessoa) return erro("Faça login para consultar as feiras.", 401);
  if (!pessoa.podeVer) return erro("Sem permissão para consultar as feiras.", 403);
  try {
    const { db } = firebaseAdmin();
    const docs = await db.collection("feirasCadastradas").get();
    const cadastradas = docs.docs.map((doc) => ({ id: doc.id,
      nome: doc.data().nome, tipo: doc.data().tipo,
      diaSemana: doc.data().diaSemana ?? null,
      data: doc.data().data ?? null,
      responsaveis: doc.data().responsaveis ?? [],
      ativo: doc.data().ativo !== false,
      versao: doc.data().versao ?? 0,
      desativadaEm: doc.data().desativadaEm ?? null,
      padrao: !!feiraPadraoPorId(doc.id),
      turno: null as string | null,
    }));
    const habituais = FEIRAS_PADRAO.map((feira) => {
      const alterada = cadastradas.find((item) => item.id === feira.id);
      const turno = "turno" in feira ? feira.turno : null;
      return alterada ? { ...alterada, padrao: true, turno } : {
        id: feira.id, nome: feira.nome, tipo: "semanal", diaSemana: feira.diaSemana,
        data: null, responsaveis: [...feira.responsaveis], ativo: true,
        versao: 0, desativadaEm: null, padrao: true, turno,
      };
    });
    return NextResponse.json({
      feiras: [...habituais, ...cadastradas.filter((feira) => !feira.padrao)],
    });
  } catch { return erro("Não foi possível carregar as feiras.", 500); }
}

export async function POST(request: NextRequest) {
  const pessoa = await identidade(request);
  if (!pessoa) return erro("Faça login para cadastrar uma feira.", 401);
  if (!pessoa.dono) return erro("Somente o Dono pode cadastrar feiras.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return erro("Envie os dados em JSON.", 415);
  }
  let dados: Entrada;
  try { dados = await request.json(); }
  catch { return erro("Dados inválidos.", 400); }
  if (!dados || typeof dados.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.id) ||
    !cadastroValido(dados)) {
    return erro("Confira nome, dia ou data e responsáveis.", 400);
  }
  const { db } = firebaseAdmin();
  const ref = db.collection("feirasCadastradas").doc(dados.id);
  const nome = (dados.nome as string).trim();
  const responsaveis = (dados.responsaveis as string[]).map((p) => p.trim());
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const anterior = await tx.get(ref);
      if (anterior.exists) {
        const salvo = anterior.data();
        if (salvo?.cadastradoPorId !== pessoa.uid || salvo?.nome !== nome ||
          salvo?.tipo !== dados.tipo ||
          JSON.stringify(salvo?.responsaveis) !== JSON.stringify(responsaveis) ||
          (dados.tipo === "semanal" ? salvo?.diaSemana !== dados.diaSemana : salvo?.data !== dados.data)) {
          throw new Error("Identificador de cadastro já utilizado.");
        }
        return { repetido: true };
      }
      tx.create(ref, {
        nome, tipo: dados.tipo, responsaveis,
        ...(dados.tipo === "semanal" ? { diaSemana: dados.diaSemana } : { data: dados.data }),
        cadastradoPorId: pessoa.uid, cadastradoEm: new Date(),
        ativo: true, versao: 0,
      });
      return { repetido: false };
    });
    return NextResponse.json({ ok: true, id: dados.id, ...resultado });
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : "Não foi possível cadastrar.", 409);
  }
}

type Edicao = Entrada & { ativo?: unknown; versao?: unknown };

export async function PUT(request: NextRequest) {
  const pessoa = await identidade(request);
  if (!pessoa) return erro("Faça login para editar feiras.", 401);
  if (!pessoa.dono) return erro("Somente o Dono pode editar feiras.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return erro("Envie os dados em JSON.", 415);
  }
  let dados: Edicao;
  try { dados = await request.json(); }
  catch { return erro("Dados inválidos.", 400); }
  if (!dados || typeof dados.id !== "string" ||
    (!feiraPadraoPorId(dados.id) && !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.id)) ||
    !cadastroValido(dados) || typeof dados.ativo !== "boolean" ||
    !Number.isInteger(dados.versao) || (dados.versao as number) < 0) {
    return erro("Confira os dados da feira.", 400);
  }
  const { db } = firebaseAdmin();
  const ref = db.collection("feirasCadastradas").doc(dados.id);
  try {
    const versao = await db.runTransaction(async (tx) => {
      const anterior = await tx.get(ref);
      const padrao = feiraPadraoPorId(dados.id as string);
      if (!anterior.exists && !padrao) throw new Error("Feira não encontrada.");
      const salvo = anterior.data() ?? { versao: 0, ativo: true };
      if ((salvo.versao ?? 0) !== dados.versao) {
        throw new Error("Esta feira foi alterada por outra pessoa. Atualize a página antes de editar.");
      }
      const proximaVersao = (dados.versao as number) + 1;
      const alteracoes = {
        nome: (dados.nome as string).trim(), tipo: dados.tipo,
        responsaveis: (dados.responsaveis as string[]).map((p) => p.trim()),
        diaSemana: dados.tipo === "semanal" ? dados.diaSemana : null,
        data: dados.tipo === "evento" ? dados.data : null,
        ativo: dados.ativo, versao: proximaVersao,
        desativadaEm: dados.ativo ? null :
          (salvo.ativo === false && salvo.desativadaEm ? salvo.desativadaEm : hojeBrasil()),
        alteradoPorId: pessoa.uid, atualizadoEm: new Date(),
      };
      if (anterior.exists) tx.update(ref, alteracoes);
      else tx.create(ref, { ...alteracoes, padrao: true, cadastradoPorId: pessoa.uid, cadastradoEm: new Date() });
      return proximaVersao;
    });
    return NextResponse.json({ ok: true, versao });
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : "Não foi possível editar.", 409);
  }
}

export async function DELETE(request: NextRequest) {
  const pessoa = await identidade(request);
  if (!pessoa) return erro("Faça login para excluir feiras.", 401);
  if (!pessoa.dono) return erro("Somente o Dono pode excluir feiras.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return erro("Envie os dados em JSON.", 415);
  }
  let dados: { id?: unknown; versao?: unknown };
  try { dados = await request.json(); }
  catch { return erro("Dados inválidos.", 400); }
  if (!dados || typeof dados.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.id) ||
    !Number.isInteger(dados.versao) || (dados.versao as number) < 0) {
    return erro("Identificador ou versão inválidos.", 400);
  }

  if (feiraPadraoPorId(dados.id)) {
    return erro("Esta feira faz parte da agenda original. Desative-a para preservar seus registros.", 409);
  }

  const { db } = firebaseAdmin();
  const ref = db.collection("feirasCadastradas").doc(dados.id);
  const colecoes = ["planejamentosFeira", "saidasFeira", "fechamentosFeira"];

  try {
    await db.runTransaction(async (tx) => {
      const cadastro = await tx.get(ref);
      if (!cadastro.exists) throw new Error("Feira não encontrada. Atualize a página.");
      if ((cadastro.data()?.versao ?? 0) !== dados.versao) {
        throw new Error("Esta feira foi alterada. Atualize a página antes de excluir.");
      }

      // Confere também destinos de reaproveitamento, que podem não ter plano.
      const registros = await Promise.all(colecoes.map((colecao) =>
        tx.get(db.collection(colecao).where("feiraId", "==", dados.id).limit(1))
      ));
      if (registros.some((consulta) => !consulta.empty)) {
        throw new Error("Esta feira possui planejamentos, saídas ou fechamentos. Desative-a para preservar o histórico.");
      }

      const colecoesPorId = ["producaoFeiras", "reaproveitamentosFeira", "saldoSobrasFeira"];
      const outros = await Promise.all(colecoesPorId.map((colecao) =>
        tx.get(db.collection(colecao).limit(501))
      ));
      if (outros.some((consulta) => consulta.size > 500)) {
        throw new Error("Há muitos registros para conferir com segurança. Desative a feira.");
      }
      if (outros.some((consulta) => consulta.docs.some((doc) =>
        doc.id.includes(`:${dados.id}|`) || doc.id.endsWith(`:${dados.id}`) ||
        (typeof doc.data().destino === "string" && doc.data().destino.endsWith(`:${dados.id}`))
      ))) {
        throw new Error("Esta feira possui produção ou reaproveitamento vinculado. Desative-a para preservar o histórico.");
      }
      tx.delete(ref);
    });
    return NextResponse.json({ ok: true });
  } catch (falha) {
    return erro(falha instanceof Error ? falha.message : "Não foi possível excluir.", 409);
  }
}
