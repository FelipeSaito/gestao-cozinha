import { describe, expect, it } from "vitest";

import {
  calcularEntradaEstoque,
  dataValida,
  hojeBrasil,
  numero,
  situacao,
  texto,
} from "@/lib/estoque-calculos";

describe("texto", () => {
  it("aceita texto preenchido dentro do limite", () => {
    expect(texto("Farinha", 20)).toBe(true);
    expect(texto("  Farinha  ", 20)).toBe(true);
  });

  it("rejeita texto vazio ou acima do limite", () => {
    expect(texto("", 20)).toBe(false);
    expect(texto("   ", 20)).toBe(false);
    expect(texto("Farinha de trigo", 5)).toBe(false);
    expect(texto(123, 20)).toBe(false);
  });
});

describe("numero", () => {
  it("aceita números positivos com as casas permitidas", () => {
    expect(numero(10, 3, false)).toBe(true);
    expect(numero(1.234, 3, false)).toBe(true);
  });

  it("controla quando o valor zero é permitido", () => {
    expect(numero(0, 3, true)).toBe(true);
    expect(numero(0, 3, false)).toBe(false);
  });

  it("rejeita valores inválidos ou com casas excedentes", () => {
    expect(numero(-1, 3, true)).toBe(false);
    expect(numero(1.2345, 3, false)).toBe(false);
    expect(numero(Number.NaN, 3, false)).toBe(false);
    expect(numero(1_000_001, 3, false)).toBe(false);
  });
});

describe("dataValida", () => {
  it("aceita uma data real no formato ISO", () => {
    expect(dataValida("2026-10-05")).toBe(true);
  });

  it("aceita o dia adicional de um ano bissexto", () => {
    expect(dataValida("2024-02-29")).toBe(true);
  });

  it("rejeita datas inexistentes ou em formato inválido", () => {
    expect(dataValida("2025-02-29")).toBe(false);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("05/10/2026")).toBe(false);
  });
});

describe("hojeBrasil", () => {
  it("considera o fuso horário de São Paulo", () => {
    const instante = new Date(
      "2026-10-05T02:30:00.000Z",
    );

    expect(hojeBrasil(instante)).toBe("2026-10-04");
  });
});

describe("situacao", () => {
  const hoje = "2026-10-05";

  it("marca produto vencido", () => {
    expect(
      situacao(20, "2026-10-04", hoje),
    ).toBe("vencido");
  });

  it("marca produto próximo do vencimento em até sete dias", () => {
    expect(
      situacao(20, "2026-10-05", hoje),
    ).toBe("proximo-vencimento");

    expect(
      situacao(20, "2026-10-12", hoje),
    ).toBe("proximo-vencimento");
  });

  it("prioriza o vencimento sobre o estoque baixo", () => {
    expect(
      situacao(2, "2026-10-06", hoje),
    ).toBe("proximo-vencimento");
  });

  it("marca estoque baixo quando o saldo é até cinco", () => {
    expect(
      situacao(5, "2026-10-13", hoje),
    ).toBe("estoque-baixo");
  });

  it("marca produto normal", () => {
    expect(
      situacao(6, "2026-10-13", hoje),
    ).toBe("normal");
  });
});

describe("calcularEntradaEstoque", () => {
  it("soma o saldo e calcula o custo médio ponderado", () => {
    expect(
      calcularEntradaEstoque(10, 10, 5, 16),
    ).toEqual({
      saldoNovo: 15,
      custoMedio: 12,
    });
  });

  it("usa o custo da entrada quando o saldo anterior é zero", () => {
    expect(
      calcularEntradaEstoque(0, 0, 2.5, 8.75),
    ).toEqual({
      saldoNovo: 2.5,
      custoMedio: 8.75,
    });
  });

  it("arredonda o saldo para três casas decimais", () => {
    expect(
      calcularEntradaEstoque(1.111, 0, 2.222, 0),
    ).toEqual({
      saldoNovo: 3.333,
      custoMedio: 0,
    });
  });

  it("rejeita valores inválidos", () => {
    expect(() =>
      calcularEntradaEstoque(-1, 10, 5, 12),
    ).toThrow("Valores inválidos");

    expect(() =>
      calcularEntradaEstoque(10, 10, 0, 12),
    ).toThrow("Valores inválidos");

    expect(() =>
      calcularEntradaEstoque(10, 10, 5, -12),
    ).toThrow("Valores inválidos");
  });

  it("rejeita entrada que arredonda o saldo para zero", () => {
    expect(() =>
      calcularEntradaEstoque(0, 0, 0.0001, 10),
    ).toThrow(
      "Saldo calculado inválido para a entrada do estoque.",
    );
  });

  it("aceita entrada de uma milésima de unidade", () => {
    expect(
      calcularEntradaEstoque(0, 0, 0.001, 10),
    ).toEqual({
      saldoNovo: 0.001,
      custoMedio: 10,
    });
  });

  it("rejeita saldo calculado que ultrapassa o limite numérico", () => {
    expect(() =>
      calcularEntradaEstoque(
        Number.MAX_VALUE,
        1,
        Number.MAX_VALUE,
        1,
      ),
    ).toThrow(
      "Saldo calculado inválido para a entrada do estoque.",
    );
  });

  it("rejeita custo médio que ultrapassa o limite numérico", () => {
    expect(() =>
      calcularEntradaEstoque(
        10,
        Number.MAX_VALUE,
        5,
        Number.MAX_VALUE,
      ),
    ).toThrow(
      "Custo médio calculado inválido.",
    );
  });
});