/** Valores em centavos, sem arredondamento de entradas com mais de duas casas. */
export const LIMITE_FATURAMENTO_CENTAVOS = 100_000_000_000;

export function faturamentoValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) &&
    valor >= 0 && valor <= LIMITE_FATURAMENTO_CENTAVOS;
}

/** Vazio significa não informado; zero é um faturamento explicitamente informado. */
export function lerFaturamentoCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").trim();
  if (!limpo) return null;
  let normalizado: string;
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, "");
  } else if (/^\d+(?:\.\d{1,2})?$/.test(limpo)) {
    normalizado = limpo;
  } else {
    throw new Error("Informe o faturamento em reais, por exemplo 1.250,50. Use no máximo duas casas decimais.");
  }
  const [inteiro, fracao = ""] = normalizado.split(".");
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  if (!faturamentoValido(centavos)) throw new Error("O faturamento deve ser um valor positivo ou zero, dentro do limite permitido.");
  return centavos;
}

export function faturamentoParaCampo(centavos: unknown): string {
  if (!faturamentoValido(centavos)) return "";
  return `${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;
}

export function formatarFaturamento(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Preços atuais de venda; não são os custos de compra da massa. */
export const PRECOS_VENDA_CENTAVOS = {
  tradicional: 1_300,
  especial: 2_200,
  mini: 2_000,
} as const;

function normalizarSabor(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Mini tem prioridade: Mini Especial custa R$ 20, não R$ 22. */
export function precoVendaCentavos(item: { nome: string; saborId?: string }): number {
  const palavras = normalizarSabor(`${item.nome} ${item.saborId ?? ""}`).split(" ");
  if (palavras.includes("mini")) return PRECOS_VENDA_CENTAVOS.mini;
  if (palavras.includes("especial")) return PRECOS_VENDA_CENTAVOS.especial;
  return PRECOS_VENDA_CENTAVOS.tradicional;
}

/** Calcula somente saídas conferidas. Dados inválidos não viram faturamento zero. */
export function calcularFaturamentoSaida(itens: unknown): number | null {
  if (!Array.isArray(itens) || itens.length === 0) return null;
  let total = 0;
  for (const valor of itens) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const item = valor as Record<string, unknown>;
    if (typeof item.nome !== "string" || !item.nome.trim() ||
      typeof item.separado !== "number" || !Number.isSafeInteger(item.separado) || item.separado < 0 ||
      (item.saborId !== undefined && typeof item.saborId !== "string")) return null;
    total += item.separado * precoVendaCentavos({
      nome: item.nome, saborId: typeof item.saborId === "string" ? item.saborId : undefined,
    });
    if (!faturamentoValido(total)) return null;
  }
  return total;
}

export type TipoLocalFaturamento = "feira" | "evento";

/** Liberdade foi um evento, inclusive nos registros antigos cadastrados como feira. */
export function tipoLocalFaturamento(local: { id: string; nome: string; tipo?: string }): TipoLocalFaturamento {
  const nomes = [normalizarSabor(local.id), normalizarSabor(local.nome)];
  if (local.tipo === "evento" || nomes.some(nome => nome === "liberdade" || nome === "evento liberdade")) {
    return "evento";
  }
  return "feira";
}

type Referencia = {
  chave: string; data: string; feiraId: string; feira: string; tipo?: TipoLocalFaturamento;
};
type SaidaComItens = { itens: unknown };
export type GrupoFaturamento = {
  id: string; nome: string; centavos: number | null; calculadas: number; saidas: number; tipo?: TipoLocalFaturamento;
};

/** Usa as saídas das linhas já filtradas. Não depende de fechamento ou valor manual. */
export function agruparFaturamento(
  linhas: Referencia[], saidas: Record<string, SaidaComItens>,
) {
  const porFeira = new Map<string, GrupoFaturamento>();
  const porData = new Map<string, GrupoFaturamento>();
  const registros: Array<Referencia & { tipo: TipoLocalFaturamento; centavos: number | null }> = [];
  let totalCentavos = 0, calculadas = 0;
  let feirasCentavos: number | null = null;
  let eventosCentavos: number | null = null;
  function acumular(grupo: GrupoFaturamento, valor: number | null) {
    grupo.saidas++;
    if (valor !== null) {
      grupo.centavos = (grupo.centavos ?? 0) + valor;
      grupo.calculadas++;
    }
  }
  for (const linha of linhas) {
    const saida = saidas[linha.chave];
    if (!saida) continue;
    const valor = calcularFaturamentoSaida(saida.itens);
    const tipo = tipoLocalFaturamento({ id: linha.feiraId, nome: linha.feira, tipo: linha.tipo });
    registros.push({ ...linha, tipo, centavos: valor });
    if (valor !== null) {
      totalCentavos += valor; calculadas++;
      if (tipo === "evento") eventosCentavos = (eventosCentavos ?? 0) + valor;
      else feirasCentavos = (feirasCentavos ?? 0) + valor;
    }
    const feira = porFeira.get(linha.feiraId) ?? {
      id: linha.feiraId, nome: linha.feira, tipo, centavos: null, calculadas: 0, saidas: 0,
    };
    const data = porData.get(linha.data) ?? {
      id: linha.data, nome: linha.data.split("-").reverse().join("/"), centavos: null, calculadas: 0, saidas: 0,
    };
    acumular(feira, valor); acumular(data, valor);
    porFeira.set(linha.feiraId, feira); porData.set(linha.data, data);
  }
  return {
    totalCentavos: calculadas ? totalCentavos : null,
    feirasCentavos, eventosCentavos,
    calculadas, semCalculo: registros.length - calculadas, saidas: registros.length,
    porFeira: [...porFeira.values()].sort((a, b) => (b.centavos ?? -1) - (a.centavos ?? -1) || a.nome.localeCompare(b.nome, "pt-BR")),
    porData: [...porData.values()].sort((a, b) => a.id.localeCompare(b.id)),
    registros: registros.sort((a, b) => b.data.localeCompare(a.data) || a.feira.localeCompare(b.feira, "pt-BR")),
  };
}
