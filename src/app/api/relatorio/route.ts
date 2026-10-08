import { NextResponse, type NextRequest } from "next/server";
import { FieldPath, type Query, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { firebaseAdmin } from "@/lib/firebase-admin";
import { dataValida } from "@/lib/estoque-calculos";
import { somarCustoOrdem, type CustoOrdemRelatorio, type DescarteRelatorio } from "@/lib/relatorios";

export const runtime = "nodejs";

function resposta(dados: unknown, status = 200) {
  return NextResponse.json(dados, { status, headers: { "Cache-Control": "private, no-store" } });
}

class LimiteRelatorio extends Error {}

async function todas(consulta: Query, limite: number): Promise<QueryDocumentSnapshot[]> {
  const documentos: QueryDocumentSnapshot[] = [];
  let ultimo: QueryDocumentSnapshot | undefined;
  for (;;) {
    const tamanho = Math.min(500, limite + 1 - documentos.length);
    let pagina = consulta.limit(tamanho);
    if (ultimo) pagina = pagina.startAfter(ultimo);
    const snapshot = await pagina.get();
    documentos.push(...snapshot.docs);
    if (documentos.length > limite) {
      throw new LimiteRelatorio("Relatório muito amplo. Selecione um período menor.");
    }
    if (snapshot.size < tamanho) break;
    ultimo = snapshot.docs.at(-1);
  }
  return documentos;
}

export async function GET(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return resposta({ erro: "Faça login para consultar relatórios." }, 401);
  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return resposta({ erro: "Sessão inválida." }, 401);
  }
  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    if (!(perfil?.perfil === "dono" || (Array.isArray(perfil?.perfis) && perfil.perfis.includes("dono")))) {
      return resposta({ erro: "Somente o Dono pode consultar relatórios." }, 403);
    }
    const inicio = request.nextUrl.searchParams.get("inicio");
    const fim = request.nextUrl.searchParams.get("fim");
    if (!dataValida(inicio) || !dataValida(fim) || inicio > fim || inicio < "2020-01-01") {
      return resposta({ erro: "Informe um período válido a partir de 2020." }, 400);
    }
    const inicioData = new Date(`${inicio}T00:00:00-03:00`);
    const fimExclusivo = new Date(`${fim}T00:00:00-03:00`);
    fimExclusivo.setUTCDate(fimExclusivo.getUTCDate() + 1);
    if (fimExclusivo.getTime() - inicioData.getTime() > 366 * 86400000) {
      return resposta({ erro: "Consulte até 366 dias por vez." }, 400);
    }
    const [ordensDocs, descartesDocs] = await Promise.all([
      todas(db.collection("ordensProducao").where("dataProducao", ">=", inicio)
        .where("dataProducao", "<=", fim).orderBy("dataProducao"), 1000),
      todas(db.collection("movimentosDescarteFeira").where("registradoEm", ">=", inicioData)
        .where("registradoEm", "<", fimExclusivo).orderBy("registradoEm"), 10000),
    ]);
    const custosPorOrdem: Record<string, CustoOrdemRelatorio> = {};
    const ids = ordensDocs.map((doc) => doc.id);
    let totalConsumos = 0;
    // Consulta todos os consumos das ordens selecionadas, inclusive fora do período.
    for (let i = 0; i < ids.length; i += 30) {
      const registros = await todas(db.collection("consumosEstoqueCozinha")
        .where("ordemId", "in", ids.slice(i, i + 30)).orderBy(FieldPath.documentId()), 20000 - totalConsumos);
      totalConsumos += registros.length;
      for (const registro of registros) {
        const dado = registro.data();
        const id = dado.ordemId as string;
        custosPorOrdem[id] = somarCustoOrdem(custosPorOrdem[id] ?? {
          custoTotal: 0, quantidadeRegistros: 0, registrosSemCusto: 0,
        }, dado.quantidade, dado.custoUnitario);
      }
    }
    const descartes: DescarteRelatorio[] = descartesDocs.map((doc) => {
      const dado = doc.data();
      const origem = typeof dado.origem === "string" ? dado.origem : "";
      const partes = /^(\d{4}-\d{2}-\d{2}):([^|]+)\|(.+)$/.exec(origem);
      const data = dado.registradoEm?.toDate?.();
      if (!partes || !(data instanceof Date) || !Number.isSafeInteger(dado.quantidade) || dado.quantidade < 0) {
        throw new Error(`Descarte inválido: ${doc.id}`);
      }
      return {
        id: doc.id, origem, dataFeira: partes[1], feiraId: partes[2], saborId: partes[3],
        quantidade: dado.quantidade,
        motivo: typeof dado.motivo === "string" ? dado.motivo : "",
        registradoPor: typeof dado.registradoPor === "string" ? dado.registradoPor : "",
        registradoEm: data.toISOString(),
      };
    });
    return resposta({
      ordens: ordensDocs.map((doc) => ({ ...doc.data(), id: doc.id })),
      custosPorOrdem, descartes, consultadoEm: new Date().toISOString(),
    });
  } catch (erro) {
    if (erro instanceof LimiteRelatorio) return resposta({ erro: erro.message }, 413);
    console.error("Falha ao consultar relatórios", erro);
    return resposta({ erro: "Não foi possível consultar o relatório completo. Confira os logs do servidor." }, 500);
  }
}
