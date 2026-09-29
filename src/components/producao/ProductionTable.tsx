import { ArrowRight, CheckCircle2, Soup } from "lucide-react";
import type { Production } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatQuantity } from "@/lib/format";
import {
  acaoStatusLabel,
  getProductionStatusInfo,
} from "@/lib/producao-status";
import styles from "./ProductionTable.module.css";

interface ProductionTableProps {
  producoes: Production[];
  onAvancar: (producao: Production) => void;
}

export function ProductionTable({ producoes, onAvancar }: ProductionTableProps) {
  if (producoes.length === 0) {
    return (
      <div className={styles.empty}>
        <Soup size={32} aria-hidden="true" />
        <p className={styles.emptyTitle}>Nenhuma produção encontrada</p>
        <p className={styles.emptyText}>
          Ajuste a busca ou os filtros, ou registre uma nova produção.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Prato</th>
            <th scope="col">Categoria</th>
            <th scope="col" className={styles.numeric}>Quantidade</th>
            <th scope="col">Responsável</th>
            <th scope="col">Data</th>
            <th scope="col">Situação</th>
            <th scope="col"><span className={styles.srOnly}>Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {producoes.map((producao) => {
            const status = getProductionStatusInfo(producao.status);
            const acao = acaoStatusLabel(producao.status);
            const insumos = producao.insumos.map((i) => i.nome).join(", ");
            return (
              <tr key={producao.id}>
                <td className={styles.mono}>{producao.codigo}</td>
                <td>
                  <span className={styles.name}>{producao.prato}</span>
                  <span className={styles.insumos}>
                    {insumos || "Insumos a definir"}
                  </span>
                </td>
                <td>{producao.categoria}</td>
                <td className={styles.numeric}>
                  {formatQuantity(producao.quantidade, producao.unidade)}
                </td>
                <td>{producao.responsavel}</td>
                <td>{formatDate(producao.dataProducao)}</td>
                <td>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </td>
                <td className={styles.actions}>
                  {acao ? (
                    <Button
                      size="small"
                      variant={
                        producao.status === "em-andamento"
                          ? "success"
                          : "secondary"
                      }
                      leftIcon={
                        producao.status === "em-andamento" ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )
                      }
                      onClick={() => onAvancar(producao)}
                    >
                      {acao}
                    </Button>
                  ) : (
                    <span className={styles.done} aria-hidden="true">
                      —
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}