import { describe, expect, it } from "vitest";

import {
  campoCsv,
  somarCustoOrdem,
  type CustoOrdemRelatorio,
} from "./relatorios";

describe("campoCsv", () => {
  it("envolve textos em aspas", () => {
    expect(campoCsv("Farinha")).toBe('"Farinha"');
  });

  it("escapa aspas dentro do texto", () => {
    expect(campoCsv('Farinha "especial"')).toBe(
      '"Farinha ""especial"""',
    );
  });

  it("preserva separadores e quebras de linha dentro das aspas", () => {
    expect(campoCsv("Carne; queijo\nFrango")).toBe(
      '"Carne; queijo\nFrango"',
    );
  });

  it("exporta null como campo vazio", () => {
    expect(campoCsv(null)).toBe('""');
  });

  it("exporta números finitos", () => {
    expect(campoCsv(12.5)).toBe('"12.5"');
    expect(campoCsv(0)).toBe('"0"');
    expect(campoCsv(-5)).toBe('"-5"');
  });

  it.each([NaN, Infinity, -Infinity])(
    "rejeita número não finito: %s",
    (valor) => {
      expect(() => campoCsv(valor)).toThrow(
        "Número inválido no relatório.",
      );
    },
  );

  it.each([
    "=1+1",
    "+1+1",
    "-1+1",
    "@SUM(A1)",
    "  =1+1",
    "\t=1+1",
  ])("protege texto que pode ser interpretado como fórmula: %s", (valor) => {
    expect(campoCsv(valor)).toBe(`"'${valor}"`);
  });
});

describe("somarCustoOrdem", () => {
  function estadoInicial(): CustoOrdemRelatorio {
    return {
      custoTotal: 0,
      quantidadeRegistros: 0,
      registrosSemCusto: 0,
    };
  }

  it("multiplica quantidade pelo custo unitário", () => {
    expect(
      somarCustoOrdem(estadoInicial(), 2, 12.5),
    ).toEqual({
      custoTotal: 25,
      quantidadeRegistros: 1,
      registrosSemCusto: 0,
    });
  });

  it("acumula custos e a quantidade de registros", () => {
    const primeiro = somarCustoOrdem(
      estadoInicial(),
      2,
      10,
    );

    expect(
      somarCustoOrdem(primeiro, 3, 5),
    ).toEqual({
      custoTotal: 35,
      quantidadeRegistros: 2,
      registrosSemCusto: 0,
    });
  });

  it("aceita custo zero como informado", () => {
    expect(
      somarCustoOrdem(estadoInicial(), 5, 0),
    ).toEqual({
      custoTotal: 0,
      quantidadeRegistros: 1,
      registrosSemCusto: 0,
    });
  });

  it("aceita quantidade zero", () => {
    expect(
      somarCustoOrdem(estadoInicial(), 0, 10),
    ).toEqual({
      custoTotal: 0,
      quantidadeRegistros: 1,
      registrosSemCusto: 0,
    });
  });

  it.each([
    { quantidade: 2, custo: undefined },
    { quantidade: 2, custo: null },
    { quantidade: 2, custo: "10" },
    { quantidade: 2, custo: -1 },
    { quantidade: 2, custo: NaN },
    { quantidade: 2, custo: Infinity },
    { quantidade: undefined, custo: 10 },
    { quantidade: "2", custo: 10 },
    { quantidade: -1, custo: 10 },
    { quantidade: NaN, custo: 10 },
    { quantidade: Infinity, custo: 10 },
  ])(
    "marca registro sem custo quando os valores são inválidos: %o",
    ({ quantidade, custo }) => {
      const anterior: CustoOrdemRelatorio = {
        custoTotal: 30,
        quantidadeRegistros: 2,
        registrosSemCusto: 1,
      };

      expect(
        somarCustoOrdem(anterior, quantidade, custo),
      ).toEqual({
        custoTotal: 30,
        quantidadeRegistros: 3,
        registrosSemCusto: 2,
      });
    },
  );

  it("marca registro sem custo quando a multiplicação excede o limite numérico", () => {
    expect(
      somarCustoOrdem(
        estadoInicial(),
        Number.MAX_VALUE,
        2,
      ),
    ).toEqual({
      custoTotal: 0,
      quantidadeRegistros: 1,
      registrosSemCusto: 1,
    });
  });

  it("rejeita estouro do custo acumulado", () => {
    const anterior: CustoOrdemRelatorio = {
      custoTotal: Number.MAX_VALUE,
      quantidadeRegistros: 1,
      registrosSemCusto: 0,
    };

    expect(() =>
      somarCustoOrdem(anterior, 1, Number.MAX_VALUE),
    ).toThrow("Custo acumulado inválido.");
  });

  it("não modifica o estado recebido", () => {
    const anterior = estadoInicial();

    somarCustoOrdem(anterior, 2, 10);

    expect(anterior).toEqual({
      custoTotal: 0,
      quantidadeRegistros: 0,
      registrosSemCusto: 0,
    });
  });
});