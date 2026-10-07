import type {
  TransferItem,
  TransferStatus,
} from "@/types";

export interface ItemRecebido {
  itemId: string;
  quantidadeRecebida: number;
  recebidoCorretamente: boolean;
  observacao?: string;
}

export interface ItemRecebimentoValidado {
  item: TransferItem;
  recebido: ItemRecebido;
  divergencia: boolean;
}

export interface ResultadoConferencia {
  itens: ItemRecebimentoValidado[];
  status: Extract<
    TransferStatus,
    "conferida" | "divergencia"
  >;
}

export function conferirRecebimento(
  itensEnviados: TransferItem[],
  itensRecebidos: ItemRecebido[],
): ResultadoConferencia {
  if (
    !Array.isArray(itensRecebidos) ||
    itensRecebidos.length === 0 ||
    itensRecebidos.length > 40 ||
    itensRecebidos.length !==
      itensEnviados.length
  ) {
    throw new Error(
      "Confira todos os itens da transferência.",
    );
  }

  const idsRecebidos =
    itensRecebidos.map(
      (item) => item.itemId,
    );

  const idsEsperados = new Set(
    itensEnviados.map(
      (item) => item.id,
    ),
  );

  if (
    new Set(idsRecebidos).size !==
      idsRecebidos.length ||
    idsRecebidos.some(
      (id) =>
        typeof id !== "string" ||
        !idsEsperados.has(id),
    )
  ) {
    throw new Error(
      "Confira todos os itens da transferência.",
    );
  }

  const itens =
    itensEnviados.map((item) => {
      const recebido =
        itensRecebidos.find(
          (entrada) =>
            entrada.itemId === item.id,
        );

      if (
        !recebido ||
        typeof recebido.quantidadeRecebida !==
          "number" ||
        !Number.isFinite(
          recebido.quantidadeRecebida,
        ) ||
        recebido.quantidadeRecebida < 0 ||
        Math.abs(
          recebido.quantidadeRecebida *
            1000 -
            Math.round(
              recebido.quantidadeRecebida *
                1000,
            ),
        ) > 1e-7 ||
        recebido.quantidadeRecebida >
          item.quantidadeEnviada ||
        typeof recebido.recebidoCorretamente !==
          "boolean"
      ) {
        throw new Error(
          `Quantidade inválida para ${item.nome}.`,
        );
      }

      const divergencia =
        !recebido.recebidoCorretamente ||
        recebido.quantidadeRecebida !==
          item.quantidadeEnviada;

      if (
        divergencia &&
        (
          typeof recebido.observacao !==
            "string" ||
          !recebido.observacao.trim() ||
          recebido.observacao.length > 500
        )
      ) {
        throw new Error(
          `Justifique a divergência de ${item.nome}.`,
        );
      }

      return {
        item,
        recebido,
        divergencia,
      };
    });

  return {
    itens,
    status: itens.some(
      (item) => item.divergencia,
    )
      ? "divergencia"
      : "conferida",
  };
}

export function calcularSaldoCozinha(
  saldoAtual: number,
  quantidadeRecebida: number,
): number {
  if (
    !Number.isFinite(saldoAtual) ||
    saldoAtual < 0 ||
    !Number.isFinite(
      quantidadeRecebida,
    ) ||
    quantidadeRecebida < 0
  ) {
    throw new Error(
      "Saldo ou quantidade recebida inválida.",
    );
  }

  return (
    Math.round(
      (
        saldoAtual +
        quantidadeRecebida
      ) * 1000,
    ) / 1000
  );
}