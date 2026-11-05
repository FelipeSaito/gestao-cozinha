import type { SaborPlanejado } from "@/services/planejamentosFirestore";

type Feira = {
  id: string;
  nome: string;
};

// Preserva os IDs utilizados nos registros existentes.
const CATALOGO_BASE = [
  ["padrao-carne", "carne"],
  ["padrao-queijo", "queijo"],
  ["padrao-pizza", "pizza"],
  ["padrao-fc", "fc"],
  ["padrao-fq", "fq"],
  ["padrao-calabresa", "calabresa"],
  ["padrao-cq", "c/q"],
  ["padrao-ovo", "ovo"],
  ["padrao-cchded", "c.chded"],
  ["padrao-bauru", "bauru"],
  ["padrao-seca", "seca"],
  ["padrao-poro", "poro"],
  ["padrao-escarola", "escarola"],
  ["padrao-pernil", "pernil"],
  ["padrao-costela", "costela"],
  ["padrao-4-queijos", "4 queijos"],
  ["padrao-chcolate", "chcolate"],
  ["padrao-doce", "doce"],
  ["padrao-especial", "especial"],
  ["padrao-palmito", "palmito"],
  ["padrao-marguerita", "marguerita"],
] as const;

const CATALOGO_EXTRAS = [
  [
    "portuguesa",
    "padrao-portuguesa",
    "portuguesa",
  ],
  [
    "mini-especial",
    "padrao-mini-especial",
    "mini especial",
  ],
  [
    "frango-cheddar",
    "padrao-frango-cheddar",
    "frango com cheddar",
  ],
  [
    "especial-frango",
    "padrao-especial-frango",
    "especial de frango",
  ],
] as const;

type SaborExtra =
  (typeof CATALOGO_EXTRAS)[number][0];

type QuantidadesExtras = Partial<
  Record<SaborExtra, number>
>;

function quantidadeValida(
  quantidade: number,
): boolean {
  return (
    Number.isSafeInteger(quantidade) &&
    quantidade >= 0
  );
}

function montar(
  quantidades: number[],
  extras: QuantidadesExtras = {},
): SaborPlanejado[] {
  if (
    quantidades.length !== CATALOGO_BASE.length ||
    quantidades.some(
      (quantidade) => !quantidadeValida(quantidade),
    ) ||
    Object.values(extras).some(
      (quantidade) => !quantidadeValida(quantidade),
    )
  ) {
    throw new Error(
      "Configuração inválida do padrão da feira.",
    );
  }

  const principais: SaborPlanejado[] =
    CATALOGO_BASE.flatMap(
      ([id, nome], indice) =>
        quantidades[indice] > 0
          ? [
              {
                id,
                nome,
                quantidade: quantidades[indice],
              },
            ]
          : [],
    );

  const adicionais: SaborPlanejado[] =
    CATALOGO_EXTRAS.flatMap(
      ([chave, id, nome]) => {
        const quantidade = extras[chave] ?? 0;

        return quantidade > 0
          ? [{ id, nome, quantidade }]
          : [];
      },
    );

  return [...principais, ...adicionais];
}

/*
 * Ordem das 21 quantidades principais:
 *
 * Carne, Queijo, Pizza, Frango Catupiry,
 * Frango com Queijo, Calabresa, Carne com Queijo,
 * Ovo, Carne com Cheddar, Bauru, Carne seca,
 * Alho-poró, Escarola, Pernil, Costela,
 * 4 Queijos, Chocolate, Doce, Especial,
 * Palmito e Marguerita.
 *
 * Zero: sabor fora do padrão fixo.
 * Os sabores extras são informados separadamente.
 */
const PADROES = {
  cerejeiras: montar([
    35, 55, 30, 30, 2, 20, 25,
    8, 3, 15, 8, 8, 7, 7, 10,
    4, 2, 2, 12, 10, 3,
  ]),

  "parque-terca": montar([
    20, 30, 20, 20, 0, 10, 20,
    5, 2, 10, 8, 4, 3, 5, 8,
    0, 2, 0, 8, 4, 3,
  ]),

  "parque-sexta": montar([
    20, 30, 20, 25, 0, 10, 20,
    5, 2, 10, 8, 4, 3, 5, 8,
    0, 2, 0, 8, 4, 3,
  ]),

  cenarios: montar([
    12, 25, 15, 15, 0, 10, 15,
    5, 0, 8, 8, 4, 4, 2, 8,
    0, 1, 0, 5, 2, 4,
  ]),

  macedonia: montar([
    15, 25, 20, 20, 0, 10, 15,
    4, 2, 8, 8, 5, 0, 3, 10,
    0, 3, 2, 8, 3, 2,
  ]),

  laranjeira: montar([
    40, 40, 40, 40, 0, 20, 30,
    8, 8, 15, 12, 10, 4, 5, 12,
    0, 0, 0, 12, 8, 4,
  ]),

  // 20 sabores, total de 226 pastéis.
  castanheira: montar([
    35, 40, 25, 20, 2, 15, 15,
    8, 4, 8, 8, 5, 4, 3, 12,
    0, 2, 2, 7, 8, 3,
  ]),

  // 13 sabores, total de 149 pastéis.
  "santa-clara": montar([
    23, // Carne
    18, // Queijo
    18, // Pizza
    18, // Frango Catupiry
    0,  // Frango com Queijo
    8,  // Calabresa
    8,  // Carne com Queijo
    5,  // Ovo
    0,  // Carne com Cheddar
    5,  // Bauru
    12, // Carne seca
    2,  // Alho-poró
    0,  // Escarola
    0,  // Pernil
    15, // Costela
    0,  // 4 Queijos
    0,  // Chocolate
    0,  // Doce
    15, // Especial
    2,  // Palmito
    0,  // Marguerita
  ]),

  // 18 sabores, total de 170 pastéis.
  embu: montar(
    [
      25, // Carne
      20, // Queijo
      15, // Pizza
      20, // Frango Catupiry
      0,  // Frango com Queijo
      8,  // Calabresa
      15, // Carne com Queijo
      3,  // Ovo
      0,  // Carne com Cheddar
      6,  // Bauru
      8,  // Carne seca
      3,  // Alho-poró
      2,  // Escarola
      5,  // Pernil
      10, // Costela
      0,  // 4 Queijos
      0,  // Chocolate
      0,  // Doce
      10, // Especial
      3,  // Palmito
      4,  // Marguerita
    ],
    {
      portuguesa: 5,
      "mini-especial": 8,
    },
  ),

  // Domingo: 19 sabores, total de 325 pastéis.
  "jardim-independencia": montar(
    [
      40, // Carne
      40, // Queijo
      40, // Pizza
      40, // Frango Catupiry
      6,  // Frango com Queijo
      15, // Calabresa
      40, // Carne com Queijo
      4,  // Ovo
      3,  // Carne com Cheddar
      15, // Bauru
      20, // Carne seca
      0,  // Alho-poró
      0,  // Escarola
      0,  // Pernil
      20, // Costela
      0,  // 4 Queijos
      0,  // Chocolate
      0,  // Doce
      20, // Especial
      2,  // Palmito
      0,  // Marguerita
    ],
    {
      portuguesa: 5,
      "mini-especial": 10,
      "frango-cheddar": 3,
      "especial-frango": 2,
    },
  ),
};

type PadraoId = keyof typeof PADROES;

function normalizar(nome: string): string {
  return nome
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[()_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diaDaSemana(
  iso?: string,
): number | undefined {
  if (
    !iso ||
    !/^\d{4}-\d{2}-\d{2}$/.test(iso)
  ) {
    return undefined;
  }

  const data = new Date(
    `${iso}T12:00:00Z`,
  );

  if (
    !Number.isFinite(data.getTime()) ||
    data.toISOString().slice(0, 10) !== iso
  ) {
    return undefined;
  }

  return data.getUTCDay();
}

function identificar(
  feira: Feira,
  dataIso?: string,
): PadraoId | undefined {
  const aliases: Record<string, PadraoId> = {
    cerejeira: "cerejeiras",
    cerejeiras: "cerejeiras",

    laranjeira: "laranjeira",
    laranjeiras: "laranjeira",

    castanheira: "castanheira",
    castanheiras: "castanheira",

    cenarios: "cenarios",
    macedonia: "macedonia",

    "santa clara": "santa-clara",

    embu: "embu",
    "embu das artes": "embu",

    "jardim independencia": "jardim-independencia",
    "jardim da independencia": "jardim-independencia",

    "reserva terca": "parque-terca",
    "parque terca": "parque-terca",
    "reserva da serra terca": "parque-terca",
    "parque da serra terca": "parque-terca",

    "reserva sexta": "parque-sexta",
    "parque sexta": "parque-sexta",
    "reserva da serra sexta": "parque-sexta",
    "parque da serra sexta": "parque-sexta",
  };

  const nomes = [
    normalizar(feira.id),
    normalizar(feira.nome),
  ];

  for (const nome of nomes) {
    if (
      Object.prototype.hasOwnProperty.call(
        aliases,
        nome,
      )
    ) {
      return aliases[nome];
    }
  }

  const feiraDaSerra = nomes.some(
    (nome) =>
      nome === "parque da serra" ||
      nome === "reserva da serra",
  );

  if (feiraDaSerra) {
    const dia = diaDaSemana(dataIso);

    if (dia === 2) {
      return "parque-terca";
    }

    if (dia === 5) {
      return "parque-sexta";
    }
  }

  return undefined;
}

export function temPadraoCompleto(
  feira: Feira,
  dataIso?: string,
): boolean {
  return identificar(feira, dataIso) !== undefined;
}

/**
 * Retorna uma cópia do padrão.
 * Preserva os IDs e nomes correspondentes
 * quando o planejamento já possui o sabor.
 */
export function padraoDaFeira(
  feira: Feira,
  atuais: SaborPlanejado[] = [],
  dataIso?: string,
): SaborPlanejado[] | undefined {
  const id = identificar(feira, dataIso);

  if (!id) {
    return undefined;
  }

  return PADROES[id].map((item) => {
    const existente =
      atuais.find(
        (atual) => atual.id === item.id,
      ) ??
      atuais.find(
        (atual) =>
          normalizar(atual.nome) ===
          normalizar(item.nome),
      );

    return {
      ...item,
      id: existente?.id ?? item.id,
      nome: existente?.nome ?? item.nome,
    };
  });
}

/**
 * Mantém o nome da exportação usada pelo formulário.
 * Inclui todos os sabores, mesmo os que não fazem
 * parte do padrão de Cerejeiras.
 *
 * Quantidade zero no catálogo não adiciona o sabor
 * automaticamente ao planejamento.
 */
export const SABORES_CEREJEIRAS: SaborPlanejado[] = [
  ...CATALOGO_BASE.map(([id, nome]) => ({
    id,
    nome,
    quantidade:
      PADROES.cerejeiras.find(
        (sabor) => sabor.id === id,
      )?.quantidade ?? 0,
  })),
  ...CATALOGO_EXTRAS.map(
    ([, id, nome]) => ({
      id,
      nome,
      quantidade: 0,
    }),
  ),
];