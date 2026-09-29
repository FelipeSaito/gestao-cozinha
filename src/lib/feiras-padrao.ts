/** IDs originais das feiras. Mantenha-os estáveis para preservar os planejamentos antigos. */
export const FEIRAS_PADRAO = [
  { id: "jardim-independencia", nome: "Jardim Independência", diaSemana: 0, responsaveis: ["Márcio", "Mario"] },
  { id: "cerejeira", nome: "Cerejeiras", diaSemana: 2, responsaveis: ["Márcio"] },
  { id: "reserva-terca", nome: "Reserva da Serra", diaSemana: 2, responsaveis: ["Marquinho"] },
  { id: "cenarios", nome: "Cenários", diaSemana: 3, responsaveis: ["Marquinho"] },
  { id: "bela", nome: "Bela", diaSemana: 3, responsaveis: ["Márcio"] },
  { id: "laranjeira", nome: "Laranjeira", diaSemana: 4, responsaveis: ["Marquinho"] },
  { id: "macedonia", nome: "Macedônia", diaSemana: 4, responsaveis: ["Márcio"] },
  { id: "santa-clara", nome: "Santa Clara", diaSemana: 5, responsaveis: ["Márcio"], turno: "Manhã" },
  { id: "castanheira", nome: "Castanheira", diaSemana: 5, responsaveis: ["Márcio"] },
  { id: "reserva-sexta", nome: "Reserva da Serra", diaSemana: 5, responsaveis: ["Marquinho"] },
  { id: "embu-das-artes", nome: "Embu das Artes", diaSemana: 6, responsaveis: ["Marquinho", "Haru"] },
] as const;

export function feiraPadraoPorId(id: string) {
  return FEIRAS_PADRAO.find((feira) => feira.id === id);
}
