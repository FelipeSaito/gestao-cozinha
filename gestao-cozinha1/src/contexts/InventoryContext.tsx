"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";

import type {
  Product,
  ProductStatus,
  Transfer,
} from "@/types";

import {
  produtos as produtosIniciais,
} from "@/services/produtos";

import {
  transferenciasPendentes as transferenciasIniciais,
} from "@/services/transferencias";

interface CreateTransferData {
  produtoId: string;
  quantidade: number;
  observacao?: string;
}

export interface ReceivedTransferItem {
  itemId: string;
  quantidadeRecebida: number;
  recebidoCorretamente: boolean;
  observacao?: string;
}

interface ConfirmReceiptData {
  transferenciaId: string;
  itens: ReceivedTransferItem[];
}

interface InventoryContextValue {
  produtos: Product[];
  estoqueCozinha: Product[];
  transferencias: Transfer[];

  criarTransferencia: (
    data: CreateTransferData,
  ) => void;

  confirmarRecebimento: (
    data: ConfirmReceiptData,
  ) => void;

  removerTransferencia: (
    transferenciaId: string,
  ) => void;
}

const InventoryContext =
  createContext<InventoryContextValue | null>(
    null,
  );

interface InventoryProviderProps {
  children: ReactNode;
}

function copiarProdutos(
  produtos: Product[],
): Product[] {
  return produtos.map((produto) => ({
    ...produto,
  }));
}

function copiarTransferencias(
  transferencias: Transfer[],
): Transfer[] {
  return transferencias.map(
    (transferencia) => ({
      ...transferencia,
      itens: transferencia.itens.map(
        (item) => ({
          ...item,
        }),
      ),
    }),
  );
}

function calcularSituacao(
  quantidade: number,
  validade: string,
): ProductStatus {
  const agora = new Date();
  const dataValidade = new Date(
    `${validade}T23:59:59`,
  );

  const diferencaEmDias = Math.ceil(
    (dataValidade.getTime() -
      agora.getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (diferencaEmDias < 0) {
    return "vencido";
  }

  if (diferencaEmDias <= 7) {
    return "proximo-vencimento";
  }

  if (quantidade <= 5) {
    return "estoque-baixo";
  }

  return "normal";
}

export function InventoryProvider({
  children,
}: InventoryProviderProps) {
  const [produtos, setProdutos] = useState<
    Product[]
  >(() => copiarProdutos(produtosIniciais));

  const [
    estoqueCozinha,
    setEstoqueCozinha,
  ] = useState<Product[]>([]);

  const [
    transferencias,
    setTransferencias,
  ] = useState<Transfer[]>(() =>
    copiarTransferencias(
      transferenciasIniciais,
    ),
  );

  function criarTransferencia({
    produtoId,
    quantidade,
    observacao,
  }: CreateTransferData) {
    const produto = produtos.find(
      (item) => item.id === produtoId,
    );

    if (!produto) {
      throw new Error(
        "Produto não encontrado.",
      );
    }

    if (
      !Number.isFinite(quantidade) ||
      quantidade <= 0
    ) {
      throw new Error(
        "A quantidade deve ser maior que zero.",
      );
    }

    if (quantidade > produto.quantidade) {
      throw new Error(
        "Quantidade maior que o saldo disponível.",
      );
    }

    if (produto.situacao === "vencido") {
      throw new Error(
        "Produtos vencidos não podem ser transferidos.",
      );
    }

    const novaQuantidade =
      produto.quantidade - quantidade;

    const novaTransferencia: Transfer = {
      id: crypto.randomUUID(),
      codigo: `TRF-${Date.now()}`,
      origem: "Estoque principal",
      destino: "Estoque da cozinha",
      responsavel: "Carlos Almeida",
      criadaEm: new Date()
        .toISOString()
        .slice(0, 10),
      status: "pendente",
      observacao,
      itens: [
        {
          id: crypto.randomUUID(),
          produtoId: produto.id,
          nome: produto.nome,
          lote: produto.lote,
          unidade: produto.unidade,
          quantidadeEnviada: quantidade,
        },
      ],
    };

    setProdutos((produtosAtuais) =>
      produtosAtuais.map((item) => {
        if (item.id !== produtoId) {
          return item;
        }

        return {
          ...item,
          quantidade: novaQuantidade,
          situacao: calcularSituacao(
            novaQuantidade,
            item.validade,
          ),
        };
      }),
    );

    setTransferencias(
      (transferenciasAtuais) => [
        novaTransferencia,
        ...transferenciasAtuais,
      ],
    );
  }

  function confirmarRecebimento({
    transferenciaId,
    itens,
  }: ConfirmReceiptData) {
    const transferencia =
      transferencias.find(
        (item) =>
          item.id === transferenciaId,
      );

    if (!transferencia) {
      throw new Error(
        "Transferência não encontrada.",
      );
    }

    for (const itemRecebido of itens) {
      if (
        !Number.isFinite(
          itemRecebido.quantidadeRecebida,
        ) ||
        itemRecebido.quantidadeRecebida < 0
      ) {
        throw new Error(
          "A quantidade recebida é inválida.",
        );
      }

      const itemTransferencia =
        transferencia.itens.find(
          (item) =>
            item.id === itemRecebido.itemId,
        );

      if (!itemTransferencia) {
        throw new Error(
          "Item da transferência não encontrado.",
        );
      }

      // Valida todos os vínculos antes de alterar qualquer estoque.
    for (const item of transferencia.itens) {
      if (!item.produtoId) {
        throw new Error(
          `O item "${item.nome}" não possui produtoId. ` +
          "Corrija o vínculo dessa transferência com o estoque principal.",
        );
      }

      const produtoOriginal = produtos.find(
        (produto) => produto.id === item.produtoId,
      );

      if (!produtoOriginal) {
        throw new Error(
          `O produto "${item.nome}" não foi encontrado no estoque principal. ` +
          `produtoId da transferência: ${item.produtoId}.`,
        );
      }

      if (
        produtoOriginal.lote !== item.lote ||
        produtoOriginal.unidade !== item.unidade
      ) {
        throw new Error(
          `O lote ou a unidade de "${item.nome}" não corresponde ` +
          "ao produto vinculado no estoque principal.",
        );
      }
    }

      if (
        itemRecebido.quantidadeRecebida >
        itemTransferencia.quantidadeEnviada
      ) {
        throw new Error(
          `A quantidade recebida de ${itemTransferencia.nome} não pode ser maior que a quantidade enviada.`,
        );
      }

      const possuiDivergencia =
        !itemRecebido.recebidoCorretamente ||
        itemRecebido.quantidadeRecebida !==
          itemTransferencia.quantidadeEnviada;

      if (
        possuiDivergencia &&
        !itemRecebido.observacao?.trim()
      ) {
        throw new Error(
          `Informe a justificativa da divergência de ${itemTransferencia.nome}.`,
        );
      }
    }

    setEstoqueCozinha(
      (estoqueAtual) => {
        let novoEstoque = [...estoqueAtual];

        for (const itemRecebido of itens) {
          if (
            itemRecebido.quantidadeRecebida <=
            0
          ) {
            continue;
          }

          const itemTransferencia =
            transferencia.itens.find(
              (item) =>
                item.id ===
                itemRecebido.itemId,
            );

          if (!itemTransferencia) {
            continue;
          }

          const produtoOriginal =
            produtos.find(
              (produto) =>
                produto.id ===
                itemTransferencia.produtoId,
            );

          if (!produtoOriginal) {
            continue;
          }

          const produtoExistente =
            novoEstoque.find(
              (produto) =>
                produto.id ===
                  produtoOriginal.id &&
                produto.lote ===
                  produtoOriginal.lote,
            );

          if (produtoExistente) {
            novoEstoque =
              novoEstoque.map((produto) => {
                const mesmoProduto =
                  produto.id ===
                    produtoOriginal.id &&
                  produto.lote ===
                    produtoOriginal.lote;

                if (!mesmoProduto) {
                  return produto;
                }

                const novaQuantidade =
                  produto.quantidade +
                  itemRecebido.quantidadeRecebida;

                return {
                  ...produto,
                  quantidade: novaQuantidade,
                  situacao:
                    calcularSituacao(
                      novaQuantidade,
                      produto.validade,
                    ),
                };
              });
          } else {
            novoEstoque.push({
              ...produtoOriginal,
              quantidade:
                itemRecebido.quantidadeRecebida,
              situacao: calcularSituacao(
                itemRecebido.quantidadeRecebida,
                produtoOriginal.validade,
              ),
            });
          }
        }

        return novoEstoque;
      },
    );

    setTransferencias(
      (transferenciasAtuais) =>
        transferenciasAtuais.filter(
          (item) =>
            item.id !== transferenciaId,
        ),
    );
  }

  function removerTransferencia(
    transferenciaId: string,
  ) {
    setTransferencias(
      (transferenciasAtuais) =>
        transferenciasAtuais.filter(
          (transferencia) =>
            transferencia.id !==
            transferenciaId,
        ),
    );
  }

  return (
    <InventoryContext.Provider
      value={{
        produtos,
        estoqueCozinha,
        transferencias,
        criarTransferencia,
        confirmarRecebimento,
        removerTransferencia,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(
    InventoryContext,
  );

  if (!context) {
    throw new Error(
      "useInventory deve ser utilizado dentro de InventoryProvider.",
    );
  }

  return context;
}