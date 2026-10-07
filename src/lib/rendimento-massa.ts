import type {
  ResultadoProducaoMassa,
} from "@/types";

export const PESO_REFERENCIA_BLOCO_KG =
  1.53;

export const ROLOS_POR_SACO = 3;

export function quantidadeBlocosValida(
  valor: unknown,
): valor is number {
  return (
    typeof valor === "number" &&
    Number.isSafeInteger(valor) &&
    valor > 0 &&
    valor <= 100_000
  );
}

export interface DadosRendimentoMassa {
  pesoBaseKg: number;
  quantidadeBlocos: number;
  quantidadeSacos: number;
}

export function calcularResultadoMassa({
  pesoBaseKg,
  quantidadeBlocos,
  quantidadeSacos,
}: DadosRendimentoMassa): ResultadoProducaoMassa {
  if (
    !Number.isFinite(pesoBaseKg) ||
    pesoBaseKg < 0 ||
    pesoBaseKg > 1_000_000
  ) {
    throw new Error(
      "Peso base da produção inválido.",
    );
  }

  if (
    !quantidadeBlocosValida(
      quantidadeBlocos,
    )
  ) {
    throw new Error(
      "Informe quantos blocos de massa foram produzidos.",
    );
  }

  if (
    !Number.isSafeInteger(
      quantidadeSacos,
    ) ||
    quantidadeSacos <= 0 ||
    quantidadeSacos > 100_000
  ) {
    throw new Error(
      "Quantidade de sacos inválida.",
    );
  }

  const pesoEstimadoKg =
    Math.round(
      quantidadeBlocos *
        PESO_REFERENCIA_BLOCO_KG *
        1000,
    ) / 1000;

  const quantidadeRolos =
    quantidadeSacos *
    ROLOS_POR_SACO;

  return {
    pesoBaseKg,
    quantidadeBlocos,
    pesoReferenciaBlocoKg:
      PESO_REFERENCIA_BLOCO_KG,
    pesoEstimadoKg,
    quantidadeSacos,
    quantidadeRolos,
  };
}