import {
  describe,
  expect,
  it,
} from "vitest";

import {
  calcularResultadoMassa,
  PESO_REFERENCIA_BLOCO_KG,
  quantidadeBlocosValida,
  ROLOS_POR_SACO,
} from "@/lib/rendimento-massa";

describe("constantes da produção de massa", () => {
  it("mantém as referências operacionais", () => {
    expect(
      PESO_REFERENCIA_BLOCO_KG,
    ).toBe(1.53);

    expect(
      ROLOS_POR_SACO,
    ).toBe(3);
  });
});

describe("quantidadeBlocosValida", () => {
  it("aceita quantidade inteira dentro do limite", () => {
    expect(
      quantidadeBlocosValida(135),
    ).toBe(true);

    expect(
      quantidadeBlocosValida(
        100_000,
      ),
    ).toBe(true);
  });

  it("rejeita quantidade inválida", () => {
    expect(
      quantidadeBlocosValida(0),
    ).toBe(false);

    expect(
      quantidadeBlocosValida(-1),
    ).toBe(false);

    expect(
      quantidadeBlocosValida(1.5),
    ).toBe(false);

    expect(
      quantidadeBlocosValida(
        100_001,
      ),
    ).toBe(false);

    expect(
      quantidadeBlocosValida(
        Number.NaN,
      ),
    ).toBe(false);
  });
});

describe("calcularResultadoMassa", () => {
  it("calcula o rendimento real informado", () => {
    expect(
      calcularResultadoMassa({
        pesoBaseKg: 150,
        quantidadeBlocos: 135,
        quantidadeSacos: 44,
      }),
    ).toEqual({
      pesoBaseKg: 150,
      quantidadeBlocos: 135,
      pesoReferenciaBlocoKg: 1.53,
      pesoEstimadoKg: 206.55,
      quantidadeSacos: 44,
      quantidadeRolos: 132,
    });
  });

  it("calcula três rolos por saco", () => {
    const resultado =
      calcularResultadoMassa({
        pesoBaseKg: 100,
        quantidadeBlocos: 80,
        quantidadeSacos: 10,
      });

    expect(
      resultado.quantidadeRolos,
    ).toBe(30);
  });

  it("permite peso base zero como contingência", () => {
    expect(
      calcularResultadoMassa({
        pesoBaseKg: 0,
        quantidadeBlocos: 1,
        quantidadeSacos: 1,
      }).pesoBaseKg,
    ).toBe(0);
  });

  it("rejeita peso base inválido", () => {
    expect(() =>
      calcularResultadoMassa({
        pesoBaseKg: -1,
        quantidadeBlocos: 10,
        quantidadeSacos: 2,
      }),
    ).toThrow(
      "Peso base da produção inválido.",
    );

    expect(() =>
      calcularResultadoMassa({
        pesoBaseKg: Number.NaN,
        quantidadeBlocos: 10,
        quantidadeSacos: 2,
      }),
    ).toThrow(
      "Peso base da produção inválido.",
    );
  });

  it("rejeita quantidade de blocos inválida", () => {
    expect(() =>
      calcularResultadoMassa({
        pesoBaseKg: 100,
        quantidadeBlocos: 0,
        quantidadeSacos: 2,
      }),
    ).toThrow(
      "Informe quantos blocos de massa foram produzidos.",
    );
  });

  it("rejeita quantidade de sacos inválida", () => {
    expect(() =>
      calcularResultadoMassa({
        pesoBaseKg: 100,
        quantidadeBlocos: 80,
        quantidadeSacos: 0,
      }),
    ).toThrow(
      "Quantidade de sacos inválida.",
    );

    expect(() =>
      calcularResultadoMassa({
        pesoBaseKg: 100,
        quantidadeBlocos: 80,
        quantidadeSacos: 1.5,
      }),
    ).toThrow(
      "Quantidade de sacos inválida.",
    );
  });
});