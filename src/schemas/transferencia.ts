import { formatQuantity } from "@/lib/format";

export interface TransferFormValues {
  quantidade: number;
  observacao: string;
}

/**
 * Valida a quantidade de uma transferência contra o saldo disponível.
 * Retorna a mensagem de erro ou `null` quando os dados são válidos.
 */
export function validarTransferencia(
  quantidade: number,
  saldo: number,
  unidade: string,
): string | null {
  if (
    !Number.isFinite(saldo) ||
    saldo < 0
  ) {
    return "O saldo disponível é inválido.";
  }

  if (
    !Number.isFinite(quantidade) ||
    quantidade <= 0
  ) {
    return "Informe uma quantidade maior que zero.";
  }

  if (quantidade > saldo) {
    return `A quantidade não pode ser maior que o saldo disponível (${formatQuantity(
      saldo,
      unidade,
    )}).`;
  }

  return null;
}