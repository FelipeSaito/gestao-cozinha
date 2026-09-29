import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";
import type { Production, ProductionStatus } from "@/types";

export const runtime = "nodejs";

type Criar = {
  acao: "criar";
  operacaoId: unknown;
  prato: unknown;
  categoria: unknown;
  quantidade: unknown;
  unidade: unknown;
  insumos: unknown;
};
type Avancar = {
  acao: "avancar"; id: unknown; statusAtual: unknown;
  locaisArmazenamento?: unknown;
  sacosPorLocal?: unknown;
};
type Dados = Criar | Avancar;

const ETAPAS_MASSA = [
  "mistura", "formacao-blocos", "esticamento", "enrolamento", "armazenamento",
] as const;
const LOCAIS_MASSA = ["freezer-1", "freezer-2", "freezer-3", "freezer-4"] as const;

function falha(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const obter = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function texto(valor: unknown, maximo: number): valor is string {
  return typeof valor === "string" && valor.trim().length > 0 && valor.trim().length <= maximo;
}

function quantidadeValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) &&
    valor > 0 && valor <= 1000000 &&
    Math.abs(valor * 1000 - Math.round(valor * 1000)) < 1e-7;
}

function insumosValidos(valor: unknown): valor is Production["insumos"] {
  return Array.isArray(valor) && valor.length <= 40 && valor.every((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const i = item as Record<string, unknown>;
    return texto(i.id, 100) && texto(i.nome, 120) && texto(i.unidade, 30) &&
      typeof i.quantidade === "number" && Number.isFinite(i.quantidade) &&
      i.quantidade >= 0 && i.quantidade <= 1000000;
  });
}

async function pessoaAutorizada(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const { auth, db } = firebaseAdmin();
  try {
    const uid = (await auth.verifyIdToken(token, true)).uid;
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!(perfil?.perfil === "dono" || perfil?.perfil === "producao" ||
      perfis.includes("dono") || perfis.includes("producao"))) return null;
    return { uid, nome: texto(perfil?.nome, 120) ? perfil.nome.trim() : "Funcionário" };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);
  if (!pessoa) return falha("Acesso negado ou sessão inválida.", 403);
  try {
    const { db } = firebaseAdmin();
    const documentos = await db.collection("ordensProducao")
      .orderBy("criadaEm", "desc").limit(100).get();
    return NextResponse.json({
      ordens: documentos.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
    });
  } catch {
    return falha("Não foi possível carregar as ordens de produção.", 500);
  }
}

export async function POST(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);
  if (!pessoa) return falha("Acesso negado ou sessão inválida.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return falha("Envie dados em JSON.", 415);
  }

  let dados: Dados;
  try { dados = await request.json(); }
  catch { return falha("Dados inválidos.", 400); }
  if (!dados || (dados.acao !== "criar" && dados.acao !== "avancar")) {
    return falha("Ação inválida.", 400);
  }

  const { db } = firebaseAdmin();
  try {
    if (dados.acao === "criar") {
      if (typeof dados.operacaoId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.operacaoId) ||
        !texto(dados.prato, 120) || !texto(dados.categoria, 80) ||
        !quantidadeValida(dados.quantidade) || !texto(dados.unidade, 30) ||
        !insumosValidos(dados.insumos)) {
        return falha("Confira nome, categoria, quantidade, unidade e ingredientes.", 400);
      }
      const id = dados.operacaoId;
      const referencia = db.collection("ordensProducao").doc(id);
      const ordem: Production = {
        id,
        codigo: `PRD-${hojeBrasil().slice(0, 4)}-${id.slice(0, 8).toUpperCase()}`,
        prato: dados.prato.trim(),
        categoria: dados.categoria.trim(),
        quantidade: dados.quantidade,
        unidade: dados.unidade.trim(),
        responsavel: pessoa.nome,
        dataProducao: hojeBrasil(),
        status: "planejada",
        insumos: dados.insumos.map((item) => ({
          id: item.id.trim(), nome: item.nome.trim(),
          quantidade: item.quantidade, unidade: item.unidade.trim(),
        })),
      };
      const massa = ordem.prato.trim().toLocaleLowerCase("pt-BR") === "massa de pastel";
      const resultado = await db.runTransaction(async (tx) => {
        const anterior = await tx.get(referencia);
        if (anterior.exists) {
          const salvo = anterior.data();
          if (salvo?.criadaPorId !== pessoa.uid || salvo?.prato !== ordem.prato ||
            salvo?.categoria !== ordem.categoria ||
            salvo?.quantidade !== ordem.quantidade || salvo?.unidade !== ordem.unidade ||
            JSON.stringify(salvo?.insumos) !== JSON.stringify(ordem.insumos)) {
            throw new Error("Identificador de operação já utilizado.");
          }
          return { ordem: { ...salvo, id }, repetida: true };
        }
        tx.create(referencia, {
          ...ordem,
          ...(massa ? { etapaMassa: "planejamento", historicoEtapas: [] } : {}),
          criadaPorId: pessoa.uid, criadaEm: new Date(),
        });
        return { ordem: { ...ordem, ...(massa ? { etapaMassa: "planejamento" } : {}) }, repetida: false };
      });
      return NextResponse.json({ ok: true, ...resultado });
    }

    if (typeof dados.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(dados.id) ||
      !["planejada", "em-andamento"].includes(String(dados.statusAtual))) {
      return falha("Ordem ou status inválido.", 400);
    }
    const referencia = db.collection("ordensProducao").doc(dados.id);
    let novoStatus: ProductionStatus = "planejada";
    let etapaMassa: string | null = null;
    await db.runTransaction(async (tx) => {
      const registro = await tx.get(referencia);
      if (!registro.exists) throw new Error("Ordem de produção não encontrada.");
      const atual = registro.data()?.status;
      if (atual !== dados.statusAtual) {
        throw new Error("O status mudou. Atualize a página e tente novamente.");
      }
      const registroData = registro.data();
      const massa = typeof registroData?.prato === "string" &&
        registroData.prato.trim().toLocaleLowerCase("pt-BR") === "massa de pastel";
      const agora = new Date();
      if (massa) {
        const etapaAtual = atual === "planejada" ? "planejamento" :
          (typeof registroData?.etapaMassa === "string" ? registroData.etapaMassa : "mistura");
        const indice = ETAPAS_MASSA.findIndex((etapa) => etapa === etapaAtual);
        if (atual === "planejada") {
          etapaMassa = "mistura";
          novoStatus = "em-andamento";
        } else if (indice >= 0 && indice < ETAPAS_MASSA.length - 1) {
          etapaMassa = ETAPAS_MASSA[indice + 1] ?? null;
          novoStatus = "em-andamento";
        } else if (etapaAtual === "armazenamento") {
          const locais = dados.locaisArmazenamento;
          if (!Array.isArray(locais) || locais.length === 0 || locais.length > 4 ||
            new Set(locais).size !== locais.length ||
            !locais.every((local) => LOCAIS_MASSA.includes(local))) {
            throw new Error("Selecione os lados do freezer onde a massa foi guardada.");
          }
          const sacos = dados.sacosPorLocal;
          if (!sacos || typeof sacos !== "object" || Array.isArray(sacos)) {
            throw new Error("Informe quantos sacos foram guardados em cada lado.");
          }
          const valores = sacos as Record<string, unknown>;
          if (Object.keys(valores).length !== locais.length ||
            !locais.every((local) => typeof valores[local] === "number" &&
              Number.isSafeInteger(valores[local] as number) &&
              (valores[local] as number) > 0 && (valores[local] as number) <= 100000)) {
            throw new Error("Informe uma quantidade inteira de sacos para cada lado selecionado.");
          }
          const totalSacos = locais.reduce((total: number, local: string) =>
            total + (valores[local] as number), 0);
          if (totalSacos > 100000) throw new Error("Quantidade de sacos acima do limite.");
          etapaMassa = "concluida";
          novoStatus = "concluida";
        } else {
          throw new Error("Etapa da massa inválida; atualize a página.");
        }
        const historico = Array.isArray(registroData?.historicoEtapas)
          ? registroData.historicoEtapas : [];
        tx.update(referencia, {
          status: novoStatus, etapaMassa,
          ...(etapaMassa === "concluida"
            ? {
              locaisArmazenamento: dados.locaisArmazenamento,
              sacosPorLocal: dados.sacosPorLocal,
              totalSacos: Object.values(dados.sacosPorLocal as Record<string, number>)
                .reduce((total, sacos) => total + sacos, 0),
              totalRolos: Object.values(dados.sacosPorLocal as Record<string, number>)
                .reduce((total, sacos) => total + sacos, 0) * 3,
            } : {}),
          historicoEtapas: [...historico, {
            etapa: etapaMassa, responsavelId: pessoa.uid,
            responsavel: pessoa.nome, registradoEm: agora,
            ...(etapaMassa === "concluida"
              ? {
                locaisArmazenamento: dados.locaisArmazenamento,
                sacosPorLocal: dados.sacosPorLocal,
              } : {}),
          }],
          alteradoPorId: pessoa.uid, alteradoPor: pessoa.nome, alteradoEm: agora,
        });
      } else {
        novoStatus = atual === "planejada" ? "em-andamento" : "concluida";
        tx.update(referencia, {
          status: novoStatus, alteradoPorId: pessoa.uid,
          alteradoPor: pessoa.nome, alteradoEm: agora,
        });
      }
    });
    return NextResponse.json({ ok: true, status: novoStatus, etapaMassa, alteradoPor: pessoa.nome });
  } catch (error) {
    return falha(error instanceof Error ? error.message : "Não foi possível atualizar a produção.", 409);
  }
}
