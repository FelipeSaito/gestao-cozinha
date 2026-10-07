import { describe, expect, it } from "vitest";
import {
  calcularAlteracaoAlocacaoSobraFeira,
  calcularNovoDescarteFeira,
  calcularSaldoSobraFeira,
  LIMITE_DESCARTE_POR_OPERACAO,
} from "@/lib/saldo-sobras-feira";

describe("calcularSaldoSobraFeira", () => {
  it("mantém todas as sobras disponíveis quando não há destinação", () => {
    expect(calcularSaldoSobraFeira({
      totalSobras: 20,
      totalAlocado: 0,
      totalDescartado: 0,
    })).toEqual({
      totalSobras: 20,
      totalAlocado: 0,
      totalDescartado: 0,
      totalDestinado: 0,
      saldoDisponivel: 20,
    });
  });

  it("desconta reaproveitamentos e descartes do saldo", () => {
    expect(calcularSaldoSobraFeira({
      totalSobras: 20,
      totalAlocado: 6,
      totalDescartado: 3,
    }).saldoDisponivel).toBe(11);
  });

  it("permite que todo o saldo já esteja destinado", () => {
    expect(calcularSaldoSobraFeira({
      totalSobras: 10,
      totalAlocado: 4,
      totalDescartado: 6,
    }).saldoDisponivel).toBe(0);
  });

  it.each([
    [{ totalSobras: -1, totalAlocado: 0, totalDescartado: 0 }],
    [{ totalSobras: 10.5, totalAlocado: 0, totalDescartado: 0 }],
    [{ totalSobras: 10, totalAlocado: -1, totalDescartado: 0 }],
    [{ totalSobras: 10, totalAlocado: 1.2, totalDescartado: 0 }],
    [{ totalSobras: 10, totalAlocado: 0, totalDescartado: -1 }],
    [{ totalSobras: 10, totalAlocado: 0, totalDescartado: 1.2 }],
  ])("rejeita valores negativos ou fracionados: %o", (estado) => {
    expect(() => calcularSaldoSobraFeira(estado)).toThrow(
      "Saldo de sobras inválido.",
    );
  });

  it("rejeita destinações maiores que o total de sobras", () => {
    expect(() => calcularSaldoSobraFeira({
      totalSobras: 10,
      totalAlocado: 7,
      totalDescartado: 4,
    })).toThrow("As destinações excedem o total de sobras.");
  });
});

describe("calcularNovoDescarteFeira", () => {
  it("soma o novo descarte e devolve o novo saldo", () => {
    expect(calcularNovoDescarteFeira({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 3,
    }, 4)).toEqual({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 7,
      totalDestinado: 12,
      quantidadeDescartada: 4,
      saldoAnterior: 12,
      saldoDisponivel: 8,
    });
  });

  it("permite descartar exatamente todo o saldo disponível", () => {
    expect(calcularNovoDescarteFeira({
      totalSobras: 12,
      totalAlocado: 5,
      totalDescartado: 2,
    }, 5).saldoDisponivel).toBe(0);
  });

  it.each([0, -1, 1.5, LIMITE_DESCARTE_POR_OPERACAO + 1])(
    "rejeita quantidade de descarte inválida: %s",
    (quantidade) => {
      expect(() => calcularNovoDescarteFeira({
        totalSobras: 20_000,
        totalAlocado: 0,
        totalDescartado: 0,
      }, quantidade)).toThrow(
        "Informe uma quantidade inteira de descarte válida.",
      );
    },
  );

  it("rejeita descarte maior que o saldo disponível", () => {
    expect(() => calcularNovoDescarteFeira({
      totalSobras: 10,
      totalAlocado: 6,
      totalDescartado: 2,
    }, 3)).toThrow("A quantidade excede as sobras ainda disponíveis.");
  });

  it("não altera o estado original", () => {
    const estado = {
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 3,
    };

    calcularNovoDescarteFeira(estado, 4);

    expect(estado).toEqual({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 3,
    });
  });
});

describe("calcularAlteracaoAlocacaoSobraFeira", () => {
  it("substitui a alocação atual pelo novo valor", () => {
    expect(calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 10,
      totalDescartado: 2,
    }, 4, 7)).toEqual({
      totalSobras: 20,
      totalAlocado: 13,
      totalDescartado: 2,
      totalDestinado: 15,
      saldoDisponivel: 5,
      alocacaoAnterior: 4,
      novaAlocacao: 7,
    });
  });

  it("remove uma alocação quando o novo valor é zero", () => {
    expect(calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 10,
      totalDescartado: 2,
    }, 4, 0).saldoDisponivel).toBe(12);
  });

  it("permite alocar exatamente todo o saldo disponível", () => {
    expect(calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 3,
    }, 0, 12).saldoDisponivel).toBe(0);
  });

  it.each([-1, 1.5])("rejeita alocação atual inválida: %s", (valor) => {
    expect(() => calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 0,
    }, valor, 2)).toThrow("Alocação de sobras inválida.");
  });

  it.each([-1, 1.5])("rejeita nova alocação inválida: %s", (valor) => {
    expect(() => calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 0,
    }, 2, valor)).toThrow("Alocação de sobras inválida.");
  });

  it("rejeita alocação atual maior que o total alocado", () => {
    expect(() => calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 5,
      totalDescartado: 0,
    }, 6, 2)).toThrow(
      "A alocação atual não corresponde ao saldo registrado.",
    );
  });

  it("rejeita nova alocação que ultrapassa o saldo", () => {
    expect(() => calcularAlteracaoAlocacaoSobraFeira({
      totalSobras: 20,
      totalAlocado: 8,
      totalDescartado: 5,
    }, 3, 11)).toThrow(
      "A nova alocação excede as sobras disponíveis.",
    );
  });
});
