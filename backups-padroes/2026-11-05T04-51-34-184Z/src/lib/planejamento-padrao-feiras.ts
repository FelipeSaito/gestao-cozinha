import type { SaborPlanejado } from "@/services/planejamentosFirestore";

type Feira = { id: string; nome: string };
// IDs já utilizados pelos planejamentos e registros de produção.
const CATALOGO = [
  ["padrao-carne", "carne"], ["padrao-queijo", "queijo"],
  ["padrao-pizza", "pizza"], ["padrao-fc", "fc"], ["padrao-fq", "fq"],
  ["padrao-calabresa", "calabresa"], ["padrao-cq", "c/q"],
  ["padrao-ovo", "ovo"], ["padrao-cchded", "c.chded"],
  ["padrao-bauru", "bauru"], ["padrao-seca", "seca"], ["padrao-poro", "poro"],
  ["padrao-escarola", "escarola"], ["padrao-pernil", "pernil"],
  ["padrao-costela", "costela"], ["padrao-4-queijos", "4 queijos"],
  ["padrao-chcolate", "chcolate"], ["padrao-doce", "doce"],
  ["padrao-especial", "especial"], ["padrao-palmito", "palmito"],
  ["padrao-marguerita", "marguerita"],
] as const;

function montar(quantidades: number[]): SaborPlanejado[] {
  if (quantidades.length !== CATALOGO.length || quantidades.some(q => !Number.isSafeInteger(q) || q < 0)) {
    throw new Error("Configuração inválida do padrão da feira.");
  }
  return CATALOGO.flatMap(([id, nome], i) => quantidades[i] > 0
    ? [{ id, nome, quantidade: quantidades[i] }] : []);
}

// Ordem: Carne, Queijo, Pizza, FC, FQ, Calabresa, C/Q, Ovo, Cheddar,
// Bauru, Seca, Poró, Escarola, Pernil, Costela, 4 Queijos,
// Chocolate, Doce, Especial, Palmito, Marguerita. Zero: sabor fora do padrão.
const PADROES = {
  cerejeiras: montar([35,55,30,30,2,20,25,8,3,15,8,8,7,7,10,4,2,2,12,10,3]),
  "parque-terca": montar([20,30,20,20,0,10,20,5,2,10,8,4,3,5,8,0,2,0,8,4,3]),
  "parque-sexta": montar([20,30,20,25,0,10,20,5,2,10,8,4,3,5,8,0,2,0,8,4,3]),
  cenarios: montar([12,25,15,15,0,10,15,5,0,8,8,4,4,2,8,0,1,0,5,2,4]),
  macedonia: montar([15,25,20,20,0,10,15,4,2,8,8,5,0,3,10,0,3,2,8,3,2]),
  // Laranjeira mantém o padrão completo já cadastrado, incluindo FC = 40.
  laranjeira: montar([40,40,40,40,0,20,30,8,8,15,12,10,4,5,12,0,0,0,12,8,4]),
  // Lista digitada e confirmada: 20 sabores, 226 pastéis.
  castanheira: montar([35,40,25,20,2,15,15,8,4,8,8,5,4,3,12,0,2,2,7,8,3]),
};

type PadraoId = keyof typeof PADROES;
function normalizar(nome: string) {
  return nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/[()_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function diaDaSemana(iso?: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const data = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === iso
    ? data.getUTCDay() : undefined;
}
function identificar(feira: Feira, dataIso?: string): PadraoId | undefined {
  const aliases: Record<string, PadraoId> = {
    cerejeira: "cerejeiras", cerejeiras: "cerejeiras",
    laranjeira: "laranjeira", laranjeiras: "laranjeira",
    castanheira: "castanheira", castanheiras: "castanheira",
    cenarios: "cenarios", macedonia: "macedonia",
    "reserva terca": "parque-terca", "parque terca": "parque-terca",
    "reserva sexta": "parque-sexta", "parque sexta": "parque-sexta",
    "reserva da serra terca": "parque-terca", "parque da serra terca": "parque-terca",
    "reserva da serra sexta": "parque-sexta", "parque da serra sexta": "parque-sexta",
  };
  const nomes = [normalizar(feira.id), normalizar(feira.nome)];
  for (const nome of nomes) if (aliases[nome]) return aliases[nome];
  if (nomes.some(nome => ["parque da serra", "reserva da serra"].includes(nome))) {
    const dia = diaDaSemana(dataIso);
    if (dia === 2) return "parque-terca";
    if (dia === 5) return "parque-sexta";
  }
  return undefined;
}
export function temPadraoCompleto(feira: Feira, dataIso?: string): boolean {
  return identificar(feira, dataIso) !== undefined;
}

/** Retorna cópias; aplicar um padrão não altera a configuração compartilhada. */
export function padraoDaFeira(
  feira: Feira, atuais: SaborPlanejado[] = [], dataIso?: string,
): SaborPlanejado[] | undefined {
  const id = identificar(feira, dataIso);
  if (id) return PADROES[id].map(item => ({ ...item }));
  // Feiras ainda sem lista completa: mantém o comportamento dos complementos.
  const complementos: Record<string, number> = { "santa clara": 2, embu: 3, "embu das artes": 3 };
  const nomes = [normalizar(feira.id), normalizar(feira.nome)];
  const nome = nomes.find(nome => Object.prototype.hasOwnProperty.call(complementos, nome));
  if (!nome || atuais.length === 0) return undefined;
  const existente = atuais.find(item => item.id === "padrao-palmito" || normalizar(item.nome) === "palmito");
  return [
    ...atuais.filter(item => item.id !== "padrao-palmito" && normalizar(item.nome) !== "palmito").map(item => ({ ...item })),
    { id: existente?.id ?? "padrao-palmito", nome: existente?.nome ?? "palmito", quantidade: complementos[nome] },
  ];
}
