export const LIMITE_DESCARTE_POR_OPERACAO = 10_000;

export interface EstadoSaldoSobraFeira {
  totalSobras: number;
  totalAlocado: number;
  totalDescartado: number;
}

export interface SaldoSobraFeira extends EstadoSaldoSobraFeira {
  totalDestinado: number;
  saldoDisponivel: number;
}

export interface NovoDescarteFeira extends SaldoSobraFeira {
  quantidadeDescartada: number;
  saldoAnterior: number;
}

export interface AlteracaoAlocacaoSobraFeira extends SaldoSobraFeira {
  alocacaoAnterior: number;
  novaAlocacao: number;
}

function inteiroNaoNegativo(valor: number) {
  return Number.isSafeInteger(valor) && valor >= 0;
}

/**
 * Calcula quanto ainda pode ser destinado ou descartado de um lote de sobras.
 */
export function calcularSaldoSobraFeira(
  estado: EstadoSaldoSobraFeira,
): SaldoSobraFeira {
  const { totalSobras, totalAlocado, totalDescartado } = estado;

  if (
    !inteiroNaoNegativo(totalSobras) ||
    !inteiroNaoNegativo(totalAlocado) ||
    !inteiroNaoNegativo(totalDescartado)
  ) {
    throw new Error("Saldo de sobras inválido.");
  }

  const totalDestinado = totalAlocado + totalDescartado;

  if (!Number.isSafeInteger(totalDestinado) || totalDestinado > totalSobras) {
    throw new Error("As destinações excedem o total de sobras.");
  }

  return {
    totalSobras,
    totalAlocado,
    totalDescartado,
    totalDestinado,
    saldoDisponivel: totalSobras - totalDestinado,
  };
}

/**
 * Valida e calcula um novo descarte sem alterar o estado recebido.
 */
export function calcularNovoDescarteFeira(
  estado: EstadoSaldoSobraFeira,
  quantidade: number,
): NovoDescarteFeira {
  if (
    !Number.isSafeInteger(quantidade) ||
    quantidade <= 0 ||
    quantidade > LIMITE_DESCARTE_POR_OPERACAO
  ) {
    throw new Error("Informe uma quantidade inteira de descarte válida.");
  }

  const saldoAtual = calcularSaldoSobraFeira(estado);

  if (quantidade > saldoAtual.saldoDisponivel) {
    throw new Error("A quantidade excede as sobras ainda disponíveis.");
  }

  const totalDescartado = saldoAtual.totalDescartado + quantidade;
  const totalDestinado = saldoAtual.totalAlocado + totalDescartado;

  return {
    totalSobras: saldoAtual.totalSobras,
    totalAlocado: saldoAtual.totalAlocado,
    totalDescartado,
    totalDestinado,
    quantidadeDescartada: quantidade,
    saldoAnterior: saldoAtual.saldoDisponivel,
    saldoDisponivel: saldoAtual.saldoDisponivel - quantidade,
  };
}

/**
 * Substitui a alocação de um destino e calcula o novo saldo do lote.
 */
export function calcularAlteracaoAlocacaoSobraFeira(
  estado: EstadoSaldoSobraFeira,
  alocacaoAtual: number,
  novaAlocacao: number,
): AlteracaoAlocacaoSobraFeira {
  if (
    !inteiroNaoNegativo(alocacaoAtual) ||
    !inteiroNaoNegativo(novaAlocacao)
  ) {
    throw new Error("Alocação de sobras inválida.");
  }

  const saldoAtual = calcularSaldoSobraFeira(estado);

  if (alocacaoAtual > saldoAtual.totalAlocado) {
    throw new Error("A alocação atual não corresponde ao saldo registrado.");
  }

  const alocadoEmOutrosDestinos =
    saldoAtual.totalAlocado - alocacaoAtual;
  const totalAlocado = alocadoEmOutrosDestinos + novaAlocacao;

  if (!Number.isSafeInteger(totalAlocado)) {
    throw new Error("Alocação de sobras inválida.");
  }

  let novoSaldo: SaldoSobraFeira;

  try {
    novoSaldo = calcularSaldoSobraFeira({
      totalSobras: saldoAtual.totalSobras,
      totalAlocado,
      totalDescartado: saldoAtual.totalDescartado,
    });
  } catch {
    throw new Error("A nova alocação excede as sobras disponíveis.");
  }

  return {
    ...novoSaldo,
    alocacaoAnterior: alocacaoAtual,
    novaAlocacao,
  };
}
