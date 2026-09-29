import type {
  ReceitaMassaPorBatelada,
  TotaisProducaoMassa,
} from "@/types";

export const KG_POR_BATELADA = 10;

export const RECEITA_MASSA_BASE: Readonly<ReceitaMassaPorBatelada> =
  {
    farinhaKg: 10,
    quantidadeSacosFarinha: 2,
    pesoSacoFarinhaKg: 5,

    coposTempero: 1,
    ajinomotoG: 60,
    salG: 345,

    oleoMl: 575,
    pingaMl: 100,
    clarasOvo: 3,

    aguaMl: 3350,
    temperaturaReferenciaC: 15,
  };

export interface ParametrosCalculoMassa {
  quantidadeDesejadaKg: number;

  /**
   * Permite ajustar a quantidade de água
   * conforme o clima do dia.
   */
  aguaMlPorBatelada?: number;

  temperaturaC?: number;
}

export interface ResultadoCalculoMassa {
  receitaPorBatelada:
    ReceitaMassaPorBatelada;

  totais: TotaisProducaoMassa;
}

/**
 * Retorna uma mensagem quando a quantidade
 * não puder ser utilizada na produção.
 */
export function validarQuantidadeMassa(
  quantidadeKg: number,
): string | null {
  if (!Number.isFinite(quantidadeKg)) {
    return "Informe uma quantidade válida.";
  }

  if (quantidadeKg <= 0) {
    return "A quantidade deve ser maior que zero.";
  }

  if (
    quantidadeKg % KG_POR_BATELADA !==
    0
  ) {
    return `A produção deve ser informada em múltiplos de ${KG_POR_BATELADA} kg.`;
  }

  return null;
}

export function calcularReceitaMassa({
  quantidadeDesejadaKg,
  aguaMlPorBatelada =
    RECEITA_MASSA_BASE.aguaMl,
  temperaturaC =
    RECEITA_MASSA_BASE.temperaturaReferenciaC,
}: ParametrosCalculoMassa): ResultadoCalculoMassa {
  const erroQuantidade =
    validarQuantidadeMassa(
      quantidadeDesejadaKg,
    );

  if (erroQuantidade) {
    throw new Error(erroQuantidade);
  }

  if (
    !Number.isFinite(
      aguaMlPorBatelada,
    ) ||
    aguaMlPorBatelada <= 0
  ) {
    throw new Error(
      "A quantidade de água deve ser maior que zero.",
    );
  }

  if (!Number.isFinite(temperaturaC)) {
    throw new Error(
      "Informe uma temperatura válida.",
    );
  }

  const quantidadeBateladas =
    quantidadeDesejadaKg /
    KG_POR_BATELADA;

  const receitaPorBatelada: ReceitaMassaPorBatelada =
    {
      ...RECEITA_MASSA_BASE,
      aguaMl: aguaMlPorBatelada,
      temperaturaReferenciaC:
        temperaturaC,
    };

  const totais: TotaisProducaoMassa =
    {
      quantidadeMassaKg:
        quantidadeDesejadaKg,

      quantidadeBateladas,

      quantidadeSacosFarinha:
        receitaPorBatelada
          .quantidadeSacosFarinha *
        quantidadeBateladas,

      farinhaKg:
        receitaPorBatelada.farinhaKg *
        quantidadeBateladas,

      coposTempero:
        receitaPorBatelada
          .coposTempero *
        quantidadeBateladas,

      ajinomotoG:
        receitaPorBatelada
          .ajinomotoG *
        quantidadeBateladas,

      salG:
        receitaPorBatelada.salG *
        quantidadeBateladas,

      oleoMl:
        receitaPorBatelada.oleoMl *
        quantidadeBateladas,

      pingaMl:
        receitaPorBatelada.pingaMl *
        quantidadeBateladas,

      clarasOvo:
        receitaPorBatelada
          .clarasOvo *
        quantidadeBateladas,

      aguaMl:
        receitaPorBatelada.aguaMl *
        quantidadeBateladas,
    };

  return {
    receitaPorBatelada,
    totais,
  };
}