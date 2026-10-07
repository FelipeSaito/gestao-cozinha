import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validarTransferencia,
} from "@/schemas/transferencia";

describe("validarTransferencia", () => {
  it("aceita uma quantidade menor que o saldo", () => {
    expect(
      validarTransferencia(
        5,
        10,
        "kg",
      ),
    ).toBeNull();
  });

  it("aceita transferir todo o saldo", () => {
    expect(
      validarTransferencia(
        10,
        10,
        "kg",
      ),
    ).toBeNull();
  });

  it("aceita quantidades decimais", () => {
    expect(
      validarTransferencia(
        1.5,
        10,
        "kg",
      ),
    ).toBeNull();
  });

  it("rejeita quantidade igual a zero", () => {
    expect(
      validarTransferencia(
        0,
        10,
        "kg",
      ),
    ).toBe(
      "Informe uma quantidade maior que zero.",
    );
  });

  it("rejeita quantidade negativa ou não finita", () => {
    expect(
      validarTransferencia(
        -1,
        10,
        "kg",
      ),
    ).toBe(
      "Informe uma quantidade maior que zero.",
    );

    expect(
      validarTransferencia(
        Number.NaN,
        10,
        "kg",
      ),
    ).toBe(
      "Informe uma quantidade maior que zero.",
    );

    expect(
      validarTransferencia(
        Number.POSITIVE_INFINITY,
        10,
        "kg",
      ),
    ).toBe(
      "Informe uma quantidade maior que zero.",
    );
  });

  it("rejeita quantidade superior ao saldo", () => {
    expect(
      validarTransferencia(
        11,
        10,
        "kg",
      ),
    ).toBe(
      "A quantidade não pode ser maior que o saldo disponível (10 kg).",
    );
  });

  it("rejeita saldo inválido", () => {
    expect(
      validarTransferencia(
        1,
        Number.NaN,
        "kg",
      ),
    ).toBe(
      "O saldo disponível é inválido.",
    );

    expect(
      validarTransferencia(
        1,
        -1,
        "kg",
      ),
    ).toBe(
      "O saldo disponível é inválido.",
    );
  });
});