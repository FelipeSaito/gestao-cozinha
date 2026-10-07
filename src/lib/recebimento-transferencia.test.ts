import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calcularSaldoCozinha,
  conferirRecebimento,
} from "@/lib/recebimento-transferencia";
import type {
  TransferItem,
} from "@/types";

const item: TransferItem = {
  id: "item-1",
  produtoId: "produto-1",
  nome: "Farinha",
  lote: "LOTE-1",
  unidade: "kg",
  quantidadeEnviada: 10,
};

describe("conferirRecebimento", () => {
  it("confirma o recebimento correto", () => {
    expect(
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 10,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toMatchObject({
      status: "conferida",
      itens: [
        {
          divergencia: false,
        },
      ],
    });
  });

  it("registra divergência quando chega quantidade menor", () => {
    expect(
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 8,
            recebidoCorretamente: false,
            observacao:
              "Faltaram dois quilos.",
          },
        ],
      ).status,
    ).toBe("divergencia");
  });

  it("registra divergência quando o item é marcado incorreto", () => {
    expect(
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 10,
            recebidoCorretamente: false,
            observacao:
              "Embalagem danificada.",
          },
        ],
      ).status,
    ).toBe("divergencia");
  });

  it("rejeita item ausente ou repetido", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [],
      ),
    ).toThrow(
      "Confira todos os itens",
    );

    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 10,
            recebidoCorretamente: true,
          },
          {
            itemId: "item-1",
            quantidadeRecebida: 10,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toThrow(
      "Confira todos os itens",
    );
  });

  it("rejeita quantidade negativa ou não finita", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: -1,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toThrow(
      "Quantidade inválida para Farinha.",
    );

    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida:
              Number.NaN,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toThrow(
      "Quantidade inválida para Farinha.",
    );
  });

  it("rejeita quantidade superior à enviada", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 11,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toThrow(
      "Quantidade inválida para Farinha.",
    );
  });

  it("rejeita quantidade com mais de três casas decimais", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida:
              1.2345,
            recebidoCorretamente: true,
          },
        ],
      ),
    ).toThrow(
      "Quantidade inválida para Farinha.",
    );
  });

  it("exige justificativa na divergência", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 8,
            recebidoCorretamente: false,
            observacao: "   ",
          },
        ],
      ),
    ).toThrow(
      "Justifique a divergência de Farinha.",
    );
  });

  it("limita a justificativa a quinhentos caracteres", () => {
    expect(() =>
      conferirRecebimento(
        [item],
        [
          {
            itemId: "item-1",
            quantidadeRecebida: 8,
            recebidoCorretamente: false,
            observacao:
              "a".repeat(501),
          },
        ],
      ),
    ).toThrow(
      "Justifique a divergência de Farinha.",
    );
  });
});

describe("calcularSaldoCozinha", () => {
  it("soma e arredonda o saldo recebido", () => {
    expect(
      calcularSaldoCozinha(
        2.345,
        1.111,
      ),
    ).toBe(3.456);
  });

  it("aceita recebimento com saldo anterior zero", () => {
    expect(
      calcularSaldoCozinha(
        0,
        5,
      ),
    ).toBe(5);
  });

  it("rejeita valores inválidos", () => {
    expect(() =>
      calcularSaldoCozinha(
        -1,
        5,
      ),
    ).toThrow(
      "Saldo ou quantidade recebida inválida.",
    );

    expect(() =>
      calcularSaldoCozinha(
        5,
        Number.NaN,
      ),
    ).toThrow(
      "Saldo ou quantidade recebida inválida.",
    );
  });
});