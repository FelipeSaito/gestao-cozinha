/*
 * PRODUTOS E ESTOQUE
 */

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

  /**
   * Validade no formato ISO:
   * yyyy-mm-dd
   */
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

/*
 * TRANSFERÊNCIAS
 */

export type TransferStatus =
  | "pendente"
  | "conferida"
  | "divergencia";

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

  /**
   * Data no formato ISO:
   * yyyy-mm-dd
   */
  criadaEm: string;

  status: TransferStatus;
  itens: TransferItem[];
  observacao?: string;
}

/*
 * USUÁRIOS E PERMISSÕES
 */

export type UserRole =
  | "dono"
  | "producao"
  | "feirantes"
  | "administracao";

export interface User {
  id: string;
  nome: string;
  cargo: string;
  iniciais: string;

  /**
   * Perfil principal do usuário.
   */
  perfil?: UserRole;

  /**
   * Permite que um usuário tenha mais de um perfil.
   */
  perfis?: UserRole[];
}

/*
 * PRODUÇÃO GENÉRICA
 */

export type ProductionStatus =
  | "planejada"
  | "em-andamento"
  | "concluida";

export interface ProductionIngredient {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
}

/**
 * Resultado registrado quando uma produção
 * de massa é concluída.
 *
 * O funcionário informa somente a quantidade
 * de blocos produzidos.
 *
 * O peso é apenas uma estimativa calculada
 * usando 1,53 kg como referência por bloco.
 *
 * A quantidade de rolos é calculada separadamente
 * pela quantidade de sacos armazenados:
 * 1 saco = 3 rolos.
 */
export interface ResultadoProducaoMassa {
  /**
   * Quantidade planejada na ordem.
   * Exemplo: 150 kg.
   */
  pesoBaseKg: number;

  /**
   * Quantidade de blocos que a produção rendeu.
   */
  quantidadeBlocos: number;

  /**
   * Peso utilizado somente como referência
   * para estimar o rendimento.
   * Atualmente: 1,53 kg por bloco.
   */
  pesoReferenciaBlocoKg: number;

  /**
   * Peso estimado calculado automaticamente:
   * quantidadeBlocos × pesoReferenciaBlocoKg.
   */
  pesoEstimadoKg: number;

  /**
   * Quantidade total de sacos armazenados.
   */
  quantidadeSacos: number;

  /**
   * Quantidade total de rolos armazenados.
   * Calculada usando 3 rolos por saco.
   */
  quantidadeRolos: number;
}

export interface Production {
  id: string;
  codigo: string;
  prato: string;
  categoria: string;
  quantidade: number;
  unidade: string;
  responsavel: string;

  /**
   * Data no formato ISO:
   * yyyy-mm-dd
   */
  dataProducao: string;

  status: ProductionStatus;
  insumos: ProductionIngredient[];

  /**
   * Preenchido quando a produção de massa
   * é concluída.
   */
  resultadoMassa?: ResultadoProducaoMassa;
}

/*
 * PRODUÇÃO DE MASSA DE PASTEL
 */

export type EtapaProducaoMassa =
  | "planejamento"
  | "mistura"
  | "formacao-blocos"
  | "esticamento"
  | "enrolamento"
  | "armazenamento"
  | "concluida";

/**
 * Receita utilizada em uma batelada
 * de 10 kg de farinha.
 */
export interface ReceitaMassaPorBatelada {
  farinhaKg: number;
  quantidadeSacosFarinha: number;
  pesoSacoFarinhaKg: number;

  coposTempero: number;
  ajinomotoG: number;
  salG: number;

  oleoMl: number;
  pingaMl: number;
  clarasOvo: number;

  /**
   * A água pode ser ajustada conforme
   * o clima e a temperatura.
   */
  aguaMl: number;
  temperaturaReferenciaC: number;
}

/**
 * Totais calculados para toda
 * a ordem de produção.
 */
export interface TotaisProducaoMassa {
  quantidadeMassaKg: number;
  quantidadeBateladas: number;

  quantidadeSacosFarinha: number;
  farinhaKg: number;

  coposTempero: number;
  ajinomotoG: number;
  salG: number;

  oleoMl: number;
  pingaMl: number;
  clarasOvo: number;
  aguaMl: number;
}

/**
 * Ordem completa de produção
 * da massa de pastel.
 */
export interface PlanoProducaoMassa {
  id: string;
  codigo: string;

  quantidadeDesejadaKg: number;
  quantidadeBateladas: number;

  receitaPorBatelada: ReceitaMassaPorBatelada;
  totais: TotaisProducaoMassa;

  etapa: EtapaProducaoMassa;
  responsavel: string;

  /**
   * Data no formato ISO:
   * yyyy-mm-dd
   */
  criadaEm: string;

  freezerId?: string;
  observacao?: string;
}

/**
 * Freezers exclusivos para
 * armazenamento das massas.
 */
export interface FreezerMassa {
  id: string;
  nome: string;
  ativo: boolean;

  /**
   * Capacidade máxima, quando conhecida.
   */
  capacidadeKg?: number;

  observacao?: string;
}