import type { ProductionStatus } from "@/types";
import type { BadgeVariant } from "@/components/ui/Badge";

interface StatusInfo {
  label: string;
  variant: BadgeVariant;
}

const STATUS_MAP: Record<ProductionStatus, StatusInfo> = {
  planejada: { label: "Planejada", variant: "info" },
  "em-andamento": { label: "Em andamento", variant: "production" },
  concluida: { label: "Concluída", variant: "success" },
};

export function getProductionStatusInfo(status: ProductionStatus): StatusInfo {
  return STATUS_MAP[status];
}

/** Próximo status no fluxo planejada → em-andamento → concluída. */
export function proximoStatus(status: ProductionStatus): ProductionStatus {
  if (status === "planejada") return "em-andamento";
  if (status === "em-andamento") return "concluida";
  return "concluida";
}

/** Rótulo do botão que avança o status (null quando já está concluída). */
export function acaoStatusLabel(status: ProductionStatus): string | null {
  if (status === "planejada") return "Iniciar";
  if (status === "em-andamento") return "Concluir";
  return null;
}

export const PRODUCTION_STATUS_FILTER_OPTIONS: Array<{
  value: ProductionStatus | "todas";
  label: string;
}> = [
  { value: "todas", label: "Todas as situações" },
  { value: "planejada", label: "Planejada" },
  { value: "em-andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
];