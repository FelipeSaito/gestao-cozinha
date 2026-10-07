import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calcularTransferenciaEstoque,
} from "@/lib/transferencia-estoque";

describe(
  "calcularTransferenciaEstoque",
  () => {
    const hoje =
      "2026-10-05";

    it("reduz o saldo disponível", () => {
      expect(
        calcularTransferenciaEstoque(
          {
            quantidade: 20,
            validade:
              "2026-10-20",
          },
          5,
          hoje,
        ),
      ).toEqual({
        saldoAnterior: 20,
        saldoNovo: 15,
        novaSituacao: "normal",
      });
    });

    it("permite transferir todo o saldo", () => {
      expect(
        calcularTransferenciaEstoque(
          {
            quantidade: 5,
            validade:
              "2026-10-20",
          },
          5,
          hoje,
        ),
      ).toEqual({
        saldoAnterior: 5,
        saldoNovo: 0,
        novaSituacao:
          "estoque-baixo",
      });
    });

    it("arredonda o saldo para três casas decimais", () => {
      expect(
        calcularTransferenciaEstoque(
          {
            quantidade: 2.345,
            validade:
              "2026-10-20",
          },
          1.111,
          hoje,
        ).saldoNovo,
      ).toBe(1.234);
    });

    it("atualiza a situação para estoque baixo", () => {
      expect(
        calcularTransferenciaEstoque(
          {
            quantidade: 10,
            validade:
              "2026-10-20",
          },
          6,
          hoje,
        ).novaSituacao,
      ).toBe("estoque-baixo");
    });

    it("prioriza a proximidade do vencimento", () => {
      expect(
        calcularTransferenciaEstoque(
          {
            quantidade: 10,
            validade:
              "2026-10-10",
          },
          2,
          hoje,
        ).novaSituacao,
      ).toBe(
        "proximo-vencimento",
      );
    });

    it("rejeita quantidade maior que o saldo", () => {
      expect(() =>
        calcularTransferenciaEstoque(
          {
            quantidade: 5,
            validade:
              "2026-10-20",
          },
          6,
          hoje,
        ),
      ).toThrow(
        "Quantidade maior que o saldo disponível.",
      );
    });

    it("rejeita produto vencido", () => {
      expect(() =>
        calcularTransferenciaEstoque(
          {
            quantidade: 10,
            validade:
              "2026-10-04",
          },
          2,
          hoje,
        ),
      ).toThrow(
        "Produto vencido não pode ser transferido.",
      );
    });

    it("rejeita quantidade inválida", () => {
      expect(() =>
        calcularTransferenciaEstoque(
          {
            quantidade: 10,
            validade:
              "2026-10-20",
          },
          0,
          hoje,
        ),
      ).toThrow(
        "Informe uma quantidade maior que zero.",
      );

      expect(() =>
        calcularTransferenciaEstoque(
          {
            quantidade: 10,
            validade:
              "2026-10-20",
          },
          Number.NaN,
          hoje,
        ),
      ).toThrow(
        "Informe uma quantidade maior que zero.",
      );
    });
  },
);