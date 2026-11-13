/** Todos os valores monetários são armazenados em centavos. */
export const LIMITE_FATURAMENTO_CENTAVOS = 100_000_000_000;

export function faturamentoValido(valor: unknown): valor is number {
  return (
    typeof valor === "number" &&
    Number.isSafeInteger(valor) &&
    valor >= 0 &&
    valor <= LIMITE_FATURAMENTO_CENTAVOS
  );
}

/** Vazio significa não informado; zero é um valor informado. */
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
    throw new Error(
      "Informe o faturamento em reais, por exemplo 1.250,50. " +
        "Use no máximo duas casas decimais.",
    );
  }

  const [inteiro, fracao = ""] = normalizado.split(".");

  const centavos =
    Number(inteiro) * 100 +
    Number(fracao.padEnd(2, "0"));

  if (!faturamentoValido(centavos)) {
    throw new Error(
      "O faturamento deve ser um valor positivo ou zero, " +
        "dentro do limite permitido.",
    );
  }

  return centavos;
}

export function faturamentoParaCampo(centavos: unknown): string {
  if (!faturamentoValido(centavos)) return "";

  return (
    `${Math.floor(centavos / 100)},` +
    String(centavos % 100).padStart(2, "0")
  );
}

export function formatarFaturamento(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Preços usados anteriormente pelo sistema.
 * Também são o padrão para locais sem configuração específica.
 */
export const PRECOS_VENDA_CENTAVOS = {
  tradicional: 1_300,
  especial: 2_200,
  mini: 2_000,
} as const;

export type PrecosVenda = {
  tradicional: number;
  especial: number;
  mini: number;
};

export function precosVendaValidos(valor: unknown): valor is PrecosVenda {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const precos = valor as Record<string, unknown>;
  return Object.keys(precos).length === 3 && ["tradicional", "especial", "mini"].every((chave) =>
    typeof precos[chave] === "number" && Number.isSafeInteger(precos[chave]) &&
    (precos[chave] as number) > 0 && (precos[chave] as number) <= 1_000_000);
}

export type ContextoPrecoFeira = {
  data: string;
  feiraId: string;
  feira: string;
  precosVenda?: PrecosVenda;
};

const INICIO_NOVOS_PRECOS = "2026-11-10";

const PRECOS_POR_FEIRA: Record<string, PrecosVenda> = {
  cerejeiras: {
    tradicional: 1_400,
    especial: 2_300,
    mini: 2_000,
  },

  cenarios: {
    tradicional: 1_400,
    especial: 2_400,
    mini: 2_000,
  },

  reserva: {
    tradicional: 1_400,
    especial: 2_400,
    mini: 2_000,
  },

  macedonia: {
    tradicional: 1_300,
    especial: 2_200,
    mini: 2_000,
  },

  laranjeira: {
    tradicional: 1_400,
    especial: 2_400,
    mini: 2_000,
  },

  "santa clara": {
    tradicional: 1_200,
    especial: 2_200,
    mini: 2_000,
  },

  castanheira: {
    tradicional: 1_400,
    especial: 2_300,
    mini: 2_000,
  },

  "jardim independencia": {
    tradicional: 1_400,
    especial: 2_300,
    mini: 2_000,
  },
};

const ALIASES_FEIRAS: Record<string, string> = {
  cerejeira: "cerejeiras",
  cerejeiras: "cerejeiras",

  cenarios: "cenarios",

  reserva: "reserva",
  "reserva da serra": "reserva",
  "reserva terca": "reserva",
  "reserva sexta": "reserva",
  "reserva da serra terca": "reserva",
  "reserva da serra sexta": "reserva",

  "parque da serra": "reserva",
  "parque terca": "reserva",
  "parque sexta": "reserva",
  "parque da serra terca": "reserva",
  "parque da serra sexta": "reserva",

  macedonia: "macedonia",

  laranjeira: "laranjeira",
  laranjeiras: "laranjeira",

  "santa clara": "santa clara",

  castanheira: "castanheira",
  castanheiras: "castanheira",

  "jardim independencia": "jardim independencia",
};

function normalizarSabor(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Usa a data da feira, não a data em que o relatório é consultado.
 * Datas anteriores ao reajuste mantêm os preços antigos.
 */
export function precosDaFeira(
  contexto?: ContextoPrecoFeira,
 ): PrecosVenda {
  if (contexto?.precosVenda !== undefined) {
    if (!precosVendaValidos(contexto.precosVenda)) throw new Error("Preços salvos inválidos.");
    return { ...contexto.precosVenda };
  }
  if (
    !contexto ||
    !/^\d{4}-\d{2}-\d{2}$/.test(contexto.data) ||
    contexto.data < INICIO_NOVOS_PRECOS
  ) {
    return { ...PRECOS_VENDA_CENTAVOS };
  }

  const nomes = [
    normalizarSabor(contexto.feiraId),
    normalizarSabor(contexto.feira),
  ];

  for (const nome of nomes) {
    if (
      !Object.prototype.hasOwnProperty.call(
        ALIASES_FEIRAS,
        nome,
      )
    ) {
      continue;
    }

    const identificador = ALIASES_FEIRAS[nome];
    const precos = PRECOS_POR_FEIRA[identificador];

    if (precos) return { ...precos };
  }

  return { ...PRECOS_VENDA_CENTAVOS };
}

/** Mini tem prioridade: Mini Especial usa o preço de Mini. */
export function precoVendaCentavos(
  item: { nome: string; saborId?: string },
  contexto?: ContextoPrecoFeira,
): number {
  const precos = precosDaFeira(contexto);

  const palavras = normalizarSabor(
    `${item.nome} ${item.saborId ?? ""}`,
  ).split(" ");

  if (palavras.includes("mini")) {
    return precos.mini;
  }

  if (palavras.includes("especial")) {
    return precos.especial;
  }

  return precos.tradicional;
}

/**
 * Calcula a previsão com base nas saídas conferidas.
 * Não desconta sobras.
 * Dados inválidos não viram faturamento zero.
 */
export function calcularFaturamentoSaida(
  itens: unknown,
  contexto?: ContextoPrecoFeira,
): number | null {
  if (!Array.isArray(itens) || itens.length === 0) {
    return null;
  }

  let total = 0;

  for (const valor of itens) {
    if (
      !valor ||
      typeof valor !== "object" ||
      Array.isArray(valor)
    ) {
      return null;
    }

    const item = valor as Record<string, unknown>;

    if (
      typeof item.nome !== "string" ||
      !item.nome.trim() ||
      typeof item.separado !== "number" ||
      !Number.isSafeInteger(item.separado) ||
      item.separado < 0 ||
      (
        item.saborId !== undefined &&
        typeof item.saborId !== "string"
      )
    ) {
      return null;
    }

    const preco = precoVendaCentavos(
      {
        nome: item.nome,
        saborId:
          typeof item.saborId === "string"
            ? item.saborId
            : undefined,
      },
      contexto,
    );

    total += item.separado * preco;

    if (!faturamentoValido(total)) {
      return null;
    }
  }

  return total;
}

export type ItemVendaCalculada = {
  saborId: string;
  nome: string;
  quantidade: number;
};

/** Confere cada sabor da saída com o fechamento; ausência não significa sobra zero. */
export function calcularItensVendidos(
  itensSaida: unknown,
  itensFechamento: unknown,
): ItemVendaCalculada[] | null {
  if (!Array.isArray(itensSaida) || !itensSaida.length ||
      !Array.isArray(itensFechamento) || itensSaida.length !== itensFechamento.length) return null;
  const fechados = new Map<string, Record<string, unknown>>();
  for (const valor of itensFechamento) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const item = valor as Record<string, unknown>;
    if (typeof item.saborId !== "string" || !item.saborId || fechados.has(item.saborId)) return null;
    fechados.set(item.saborId, item);
  }
  const vistos = new Set<string>();
  const vendidos: ItemVendaCalculada[] = [];
  for (const valor of itensSaida) {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
    const item = valor as Record<string, unknown>;
    if (typeof item.saborId !== "string" || !item.saborId || vistos.has(item.saborId) ||
        typeof item.nome !== "string" || !item.nome.trim() ||
        typeof item.separado !== "number" || !Number.isSafeInteger(item.separado) || item.separado < 0) return null;
    vistos.add(item.saborId);
    const fechamento = fechados.get(item.saborId);
    if (!fechamento || fechamento.separados !== item.separado ||
        typeof fechamento.sobraram !== "number" || !Number.isSafeInteger(fechamento.sobraram) ||
        fechamento.sobraram < 0 || fechamento.sobraram > item.separado) return null;
    vendidos.push({ saborId: item.saborId, nome: item.nome, quantidade: item.separado - fechamento.sobraram });
  }
  return vendidos;
}

/** Estimativa de vendas pelo fechamento, sem descontar novamente as baixas posteriores das sobras. */
export function calcularFaturamentoFechamento(
  itensSaida: unknown,
  itensFechamento: unknown,
  contexto?: ContextoPrecoFeira,
): number | null {
  const itens = calcularItensVendidos(itensSaida, itensFechamento);
  return itens === null ? null : calcularFaturamentoSaida(
    itens.map((item) => ({ ...item, separado: item.quantidade })), contexto,
  );
}

export type TipoLocalFaturamento = "feira" | "evento";

/**
 * Liberdade foi um evento, inclusive nos registros antigos
 * cadastrados como feira.
 */
export function tipoLocalFaturamento(local: {
  id: string;
  nome: string;
  tipo?: string;
}): TipoLocalFaturamento {
  const nomes = [
    normalizarSabor(local.id),
    normalizarSabor(local.nome),
  ];

  if (
    local.tipo === "evento" ||
    nomes.some(
      (nome) =>
        nome === "liberdade" ||
        nome === "evento liberdade",
    )
  ) {
    return "evento";
  }

  return "feira";
}

type Referencia = {
  chave: string;
  data: string;
  feiraId: string;
  feira: string;
  tipo?: TipoLocalFaturamento;
};

type SaidaComItens = {
  precosVenda?: PrecosVenda;
  itens: unknown;
};

export type GrupoFaturamento = {
  id: string;
  nome: string;
  centavos: number | null;
  calculadas: number;
  saidas: number;
  tipo?: TipoLocalFaturamento;
};

/**
 * Usa os fechamentos quando disponíveis e a previsão pela saída nas feiras abertas.
 * Aplica os preços correspondentes à feira e à data.
 * Mantém os eventos separados, incluindo-os no total geral.
 */
export function agruparFaturamento(
  linhas: Referencia[],
  saidas: Record<string, SaidaComItens>,
  retornos: Record<string, SaidaComItens> = {},
) {
  const porFeira = new Map<string, GrupoFaturamento>();
  const porData = new Map<string, GrupoFaturamento>();

  const registros: Array<
    Referencia & {
      tipo: TipoLocalFaturamento;
      centavos: number | null;
      baseCalculo: "fechamento" | "previsao";
      itensVendidos: ItemVendaCalculada[] | null;
    }
  > = [];

  let totalCentavos = 0;
  let calculadas = 0;

  let feirasCentavos: number | null = null;
  let eventosCentavos: number | null = null;

  function acumular(
    grupo: GrupoFaturamento,
    valor: number | null,
  ) {
    grupo.saidas++;

    if (valor !== null) {
      grupo.centavos = (grupo.centavos ?? 0) + valor;
      grupo.calculadas++;
    }
  }

  for (const linha of linhas) {
    const saida = saidas[linha.chave];

    if (!saida) continue;

    const contexto = { data: linha.data, feiraId: linha.feiraId, feira: linha.feira, precosVenda: saida.precosVenda };
    const fechamento = retornos[linha.chave];
    const baseCalculo = fechamento ? "fechamento" as const : "previsao" as const;
    const itensVendidos = fechamento ? calcularItensVendidos(saida.itens, fechamento.itens) : null;
    const valor = saida.precosVenda !== undefined && !precosVendaValidos(saida.precosVenda) ? null : fechamento
      ? calcularFaturamentoFechamento(saida.itens, fechamento.itens, contexto)
      : calcularFaturamentoSaida(saida.itens, contexto);

    const tipo = tipoLocalFaturamento({
      id: linha.feiraId,
      nome: linha.feira,
      tipo: linha.tipo,
    });

    registros.push({
      ...linha,
      tipo,
      centavos: valor,
      baseCalculo,
      itensVendidos,
    });

    if (valor !== null) {
      totalCentavos += valor;
      calculadas++;

      if (tipo === "evento") {
        eventosCentavos = (eventosCentavos ?? 0) + valor;
      } else {
        feirasCentavos = (feirasCentavos ?? 0) + valor;
      }
    }

    const feira: GrupoFaturamento =
      porFeira.get(linha.feiraId) ?? {
        id: linha.feiraId,
        nome: linha.feira,
        tipo,
        centavos: null,
        calculadas: 0,
        saidas: 0,
      };

    const data: GrupoFaturamento =
      porData.get(linha.data) ?? {
        id: linha.data,
        nome: linha.data.split("-").reverse().join("/"),
        centavos: null,
        calculadas: 0,
        saidas: 0,
      };

    acumular(feira, valor);
    acumular(data, valor);

    porFeira.set(linha.feiraId, feira);
    porData.set(linha.data, data);
  }

  return {
    totalCentavos: calculadas ? totalCentavos : null,
    feirasCentavos,
    eventosCentavos,
    calculadas,
    semCalculo: registros.length - calculadas,
    saidas: registros.length,
    fechadas: registros.filter((item) => item.baseCalculo === "fechamento").length,
    previstas: registros.filter((item) => item.baseCalculo === "previsao").length,

    porFeira: [...porFeira.values()].sort(
      (a, b) =>
        (b.centavos ?? -1) - (a.centavos ?? -1) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    ),

    porData: [...porData.values()].sort(
      (a, b) => a.id.localeCompare(b.id),
    ),

    registros: registros.sort(
      (a, b) =>
        b.data.localeCompare(a.data) ||
        a.feira.localeCompare(b.feira, "pt-BR"),
    ),
  };
}