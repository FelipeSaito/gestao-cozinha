import type { OrdemRemota } from "@/services/ordensProducao";

export interface CustoOrdemRelatorio {
  custoTotal: number;
  quantidadeRegistros: number;
  registrosSemCusto: number;
}

export interface DescarteRelatorio {
  id: string;
  origem: string;
  feiraId: string;
  dataFeira: string;
  saborId: string;
  quantidade: number;
  motivo: string;
  registradoPor: string;
  registradoEm: string;
}

export interface ComplementoRelatorio {
  ordens: OrdemRemota[];
  custosPorOrdem: Record<string, CustoOrdemRelatorio>;
  descartes: DescarteRelatorio[];
  consultadoEm: string;
}

export function campoCsv(valor: string | number | null): string {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("Número inválido no relatório.");
    return `"${valor}"`;
  }
  const texto = valor ?? "";
  const seguro = /^[\s]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export function somarCustoOrdem(
  atual: CustoOrdemRelatorio,
  quantidade: unknown,
  custoUnitario: unknown,
): CustoOrdemRelatorio {
  const valido = typeof quantidade === "number" && Number.isFinite(quantidade) &&
    quantidade >= 0 && typeof custoUnitario === "number" &&
    Number.isFinite(custoUnitario) && custoUnitario >= 0 &&
    Number.isFinite(quantidade * custoUnitario);
  const total = atual.custoTotal + (valido ? quantidade * custoUnitario : 0);
  if (!Number.isFinite(total)) throw new Error("Custo acumulado inválido.");
  return {
    custoTotal: total,
    quantidadeRegistros: atual.quantidadeRegistros + 1,
    registrosSemCusto: atual.registrosSemCusto + (valido ? 0 : 1),
  };
}
