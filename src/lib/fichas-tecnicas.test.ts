import { describe, expect, it } from "vitest";
import { validarFichaTecnica, calcularCustoFicha } from "./fichas-tecnicas";
const base = {
  nome: "Massa", categoria: "Massa", rendimento: 2, unidadeRendimento: "kg",
  ingredientes: [{ nome: "Farinha", quantidade: 1.5, unidade: "kg", custoUnitario: 4 }],
  modoPreparo: "Misturar os ingredientes.", observacoes: "",
};
describe("fichas técnicas", () => {
  it("calcula custo total e por unidade de rendimento", () => {
    expect(calcularCustoFicha(validarFichaTecnica(base))).toEqual({ subtotal: 6, semPreco: 0, custoTotal: 6, custoPorUnidade: 3 });
  });
  it("diferencia preço ausente de preço zero", () => {
    const semPreco = validarFichaTecnica({ ...base, ingredientes: [{ ...base.ingredientes[0], custoUnitario: null }] });
    expect(calcularCustoFicha(semPreco).custoTotal).toBeNull();
    expect(calcularCustoFicha(validarFichaTecnica({ ...base, ingredientes: [{ ...base.ingredientes[0], custoUnitario: 0 }] })).custoTotal).toBe(0);
  });
  it.each([0, -1, NaN, Infinity, 1.2345])("rejeita rendimento inválido %s", (rendimento) => {
    expect(() => validarFichaTecnica({ ...base, rendimento })).toThrow();
  });
  it("rejeita ingrediente nulo", () => { expect(() => validarFichaTecnica({ ...base, ingredientes: [null] })).toThrow(); });
  it("rejeita ausência de ingredientes", () => { expect(() => validarFichaTecnica({ ...base, ingredientes: [] })).toThrow(); });
  it("rejeita preço negativo", () => { expect(() => validarFichaTecnica({ ...base, ingredientes: [{ ...base.ingredientes[0], custoUnitario: -1 }] })).toThrow(); });
  it("rejeita unidade desconhecida", () => { expect(() => validarFichaTecnica({ ...base, unidadeRendimento: "caixa" })).toThrow(); });
  it("rejeita modo de preparo vazio", () => { expect(() => validarFichaTecnica({ ...base, modoPreparo: " " })).toThrow(); });
  it("normaliza texto sem modificar o original", () => {
    const entrada = { ...base, nome: "  Massa  " };
    expect(validarFichaTecnica(entrada).nome).toBe("Massa");
    expect(entrada.nome).toBe("  Massa  ");
  });
});