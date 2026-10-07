import {
  hojeBrasil,
  situacao,
} from "@/lib/estoque-calculos";
import type { Product } from "@/types";

export interface ResultadoTransferenciaEstoque {
  saldoAnterior: number;
  saldoNovo: number;
  novaSituacao: Product["situacao"];
}

export function calcularTransferenciaEstoque(
  produto: Pick<
    Product,
    "quantidade" | "validade"
  >,
  quantidade: number,
  hoje = hojeBrasil(),
): ResultadoTransferenciaEstoque {
  if (
    !Number.isFinite(quantidade) ||
    quantidade <= 0
  ) {
    throw new Error(
      "Informe uma quantidade maior que zero.",
    );
  }

  if (
    !Number.isFinite(
      produto.quantidade,
    ) ||
    produto.quantidade <
      quantidade
  ) {
    throw new Error(
      "Quantidade maior que o saldo disponível.",
    );
  }

  if (
    produto.validade < hoje
  ) {
    throw new Error(
      "Produto vencido não pode ser transferido.",
    );
  }

  const saldoAnterior =
    produto.quantidade;

  const saldoNovo =
    Math.round(
      (
        saldoAnterior -
        quantidade
      ) * 1000,
    ) / 1000;

  return {
    saldoAnterior,
    saldoNovo,
    novaSituacao: situacao(
      saldoNovo,
      produto.validade,
      hoje,
    ),
  };
}