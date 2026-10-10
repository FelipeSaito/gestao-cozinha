export const CATEGORIAS_FICHA = ["Massa", "Recheio", "Pastel", "Outros"] as const;
export const UNIDADES_FICHA = ["kg", "g", "litro", "ml", "unidade"] as const;
export type UnidadeFicha = (typeof UNIDADES_FICHA)[number];
export interface IngredienteFicha {
  nome: string;
  quantidade: number;
  unidade: UnidadeFicha;
  custoUnitario: number | null;
}
export interface DadosFichaTecnica {
  nome: string;
  categoria: (typeof CATEGORIAS_FICHA)[number];
  rendimento: number;
  unidadeRendimento: UnidadeFicha;
  ingredientes: IngredienteFicha[];
  modoPreparo: string;
  observacoes: string;
}
export interface FichaTecnica extends DadosFichaTecnica {
  id: string;
  versao: number;
  atualizadoEm: string;
  atualizadoPor: string;
}
function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error("Dados da ficha inválidos.");
  return valor as Record<string, unknown>;
}
function texto(valor: unknown, maximo: number, opcional = false): string {
  if (typeof valor !== "string" || valor.trim().length > maximo || (!opcional && !valor.trim())) {
    throw new Error("Confira os textos da ficha e seus limites.");
  }
  return valor.trim();
}
function numero(valor: unknown, casas: number, zero = false): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor > 1_000_000 ||
      (zero ? valor < 0 : valor <= 0) || Math.abs(valor * 10 ** casas - Math.round(valor * 10 ** casas)) > 1e-7) {
    throw new Error(`Informe números válidos, com até ${casas} casas decimais.`);
  }
  return valor;
}
function unidade(valor: unknown): UnidadeFicha {
  if (!UNIDADES_FICHA.includes(valor as UnidadeFicha)) throw new Error("Unidade inválida.");
  return valor as UnidadeFicha;
}
export function validarFichaTecnica(valor: unknown): DadosFichaTecnica {
  const dados = objeto(valor);
  if (!CATEGORIAS_FICHA.includes(dados.categoria as DadosFichaTecnica["categoria"])) throw new Error("Categoria inválida.");
  if (!Array.isArray(dados.ingredientes) || dados.ingredientes.length < 1 || dados.ingredientes.length > 60) {
    throw new Error("Informe entre 1 e 60 ingredientes.");
  }
  const ingredientes = dados.ingredientes.map((entrada) => {
    const item = objeto(entrada);
    return {
      nome: texto(item.nome, 120), quantidade: numero(item.quantidade, 3), unidade: unidade(item.unidade),
      custoUnitario: item.custoUnitario === null ? null : numero(item.custoUnitario, 4, true),
    };
  });
  return {
    nome: texto(dados.nome, 120), categoria: dados.categoria as DadosFichaTecnica["categoria"],
    rendimento: numero(dados.rendimento, 3), unidadeRendimento: unidade(dados.unidadeRendimento),
    ingredientes, modoPreparo: texto(dados.modoPreparo, 10000), observacoes: texto(dados.observacoes, 2000, true),
  };
}
export function calcularCustoFicha(dados: Pick<DadosFichaTecnica, "ingredientes" | "rendimento">) {
  const semPreco = dados.ingredientes.filter((item) => item.custoUnitario === null).length;
  // O preço corresponde à unidade da própria linha; não há conversão implícita.
  const subtotal = dados.ingredientes.reduce((total, item) => total + item.quantidade * (item.custoUnitario ?? 0), 0);
  const completo = dados.ingredientes.length > 0 && semPreco === 0;
  return {
    subtotal, semPreco,
    custoTotal: completo ? subtotal : null,
    custoPorUnidade: completo && dados.rendimento > 0 ? subtotal / dados.rendimento : null,
  };
}