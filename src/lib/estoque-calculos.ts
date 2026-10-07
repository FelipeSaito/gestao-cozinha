import type { Product } from "@/types";

export function texto(
  valor: unknown,
  maximo: number,
): valor is string {
  return (
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= maximo
  );
}

export function numero(
  valor: unknown,
  casas: number,
  permiteZero: boolean,
): valor is number {
  if (
    typeof valor !== "number" ||
    !Number.isFinite(valor) ||
    valor > 1_000_000 ||
    (permiteZero ? valor < 0 : valor <= 0)
  ) {
    return false;
  }

  const fator = 10 ** casas;

  return (
    Math.abs(
      valor * fator - Math.round(valor * fator),
    ) < 1e-7
  );
}

export function dataValida(
  valor: unknown,
): valor is string {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(valor)
  ) {
    return false;
  }

  const [ano, mes, dia] = valor
    .split("-")
    .map(Number);

  const data = new Date(
    Date.UTC(ano, mes - 1, dia),
  );

  return (
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  );
}

export function hojeBrasil(
  agora = new Date(),
): string {
  const partes = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(agora);

  const campo = (tipo: string) =>
    partes.find(
      (parte) => parte.type === tipo,
    )?.value;

  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}

export function situacao(
  quantidade: number,
  validade: string,
  hoje = hojeBrasil(),
): Product["situacao"] {
  if (validade < hoje) {
    return "vencido";
  }

  const dias =
    (
      Date.parse(`${validade}T12:00:00Z`) -
      Date.parse(`${hoje}T12:00:00Z`)
    ) / 86_400_000;

  if (dias <= 7) {
    return "proximo-vencimento";
  }

  if (quantidade <= 5) {
    return "estoque-baixo";
  }

  return "normal";
}

export interface ResultadoEntradaEstoque {
  saldoNovo: number;
  custoMedio: number;
}

export function calcularEntradaEstoque(
  saldoAnterior: number,
  custoAnterior: number,
  quantidadeEntrada: number,
  custoEntrada: number,
): ResultadoEntradaEstoque {
  if (
    !Number.isFinite(saldoAnterior) ||
    saldoAnterior < 0 ||
    !Number.isFinite(custoAnterior) ||
    custoAnterior < 0 ||
    !Number.isFinite(quantidadeEntrada) ||
    quantidadeEntrada <= 0 ||
    !Number.isFinite(custoEntrada) ||
    custoEntrada < 0
  ) {
    throw new Error(
      "Valores inválidos para calcular a entrada do estoque.",
    );
  }

  const saldoNovo =
    Math.round(
      (saldoAnterior + quantidadeEntrada) * 1000,
    ) / 1000;

  if (
    !Number.isFinite(saldoNovo) ||
    saldoNovo <= 0
  ) {
    throw new Error(
      "Saldo calculado inválido para a entrada do estoque.",
    );
  }

  const custoMedio =
    Math.round(
      (
        (
          saldoAnterior * custoAnterior +
          quantidadeEntrada * custoEntrada
        ) / saldoNovo
      ) * 10_000,
    ) / 10_000;

  if (!Number.isFinite(custoMedio)) {
    throw new Error(
      "Custo médio calculado inválido.",
    );
  }

  return {
    saldoNovo,
    custoMedio,
  };
}