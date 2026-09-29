import type { ProductStatus } from "@/types";
import type { BadgeVariant } from "@/components/ui/Badge";

interface StatusInfo {
  label: string;
  variant: BadgeVariant;
}

const STATUS_MAP: Record<ProductStatus, StatusInfo> = {
  normal: { label: "Normal", variant: "success" },
  "estoque-baixo": { label: "Estoque baixo", variant: "warning" },
  "proximo-vencimento": { label: "Próximo do vencimento", variant: "warning" },
  vencido: { label: "Vencido", variant: "danger" },
};

export function getStatusInfo(status: ProductStatus): StatusInfo {
  return STATUS_MAP[status];
}

export const STATUS_FILTER_OPTIONS: Array<{
  value: ProductStatus | "todas";
  label: string;
}> = [
  { value: "todas", label: "Todas as situações" },
  { value: "normal", label: "Normal" },
  { value: "estoque-baixo", label: "Estoque baixo" },
  { value: "proximo-vencimento", label: "Próximo do vencimento" },
  { value: "vencido", label: "Vencido" },
];