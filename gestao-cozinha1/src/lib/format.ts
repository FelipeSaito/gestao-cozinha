/** Formata um número como moeda brasileira (R$). */
export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Formata quantidade + unidade, ex.: "20 kg". */
export function formatQuantity(value: number, unidade: string): string {
  const formatted = value.toLocaleString("pt-BR", {
    maximumFractionDigits: 3,
  });
  return `${formatted} ${unidade}`;
}

/** Converte uma data ISO (yyyy-mm-dd) para dd/mm/aaaa. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

/** Dias restantes até a data (negativo se já passou), ignorando horas. */
export function daysUntil(iso: string, reference: Date = new Date()): number {
  const target = new Date(`${iso}T00:00:00`);
  const ref = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  return Math.round((target.getTime() - ref.getTime()) / 86_400_000);
}
