export type ProductStatus =
  | "normal"
  | "estoque-baixo"
  | "proximo-vencimento"
  | "vencido";

export interface Product {
  id: string;
  nome: string;
  categoria: string;
  lote: string;
  /** Validade em formato ISO (yyyy-mm-dd). */
  validade: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  situacao: ProductStatus;
}

export interface StockIndicators {
  totalInsumos: number;
  estoqueBaixo: number;
  proximosVencimento: number;
  valorEstimado: number;
}

export type TransferStatus = "pendente" | "conferida" | "divergencia";

export interface TransferItem {
  id: string;
  produtoId: string;
  nome: string;
  lote: string;
  unidade: string;
  quantidadeEnviada: number;
  observacao?: string;
}

export interface Transfer {
  id: string;
  codigo: string;
  origem: string;
  destino: string;
  responsavel: string;
  /** Criação em formato ISO (yyyy-mm-dd). */
  criadaEm: string;
  status: TransferStatus;
  itens: TransferItem[];
   observacao?: string;

}

export interface User {
  id: string;
  nome: string;
  cargo: string;
  iniciais: string;
}

export type ProductionStatus = "planejada" | "em-andamento" | "concluida";

/** Insumo consumido em uma produção. */
export interface ProductionIngredient {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
}

export interface Production {
  id: string;
  codigo: string;
  prato: string;
  categoria: string;
  quantidade: number;
  unidade: string;
  responsavel: string;
  /** Data de produção em formato ISO (yyyy-mm-dd). */
  dataProducao: string;
  status: ProductionStatus;
  insumos: ProductionIngredient[];
}