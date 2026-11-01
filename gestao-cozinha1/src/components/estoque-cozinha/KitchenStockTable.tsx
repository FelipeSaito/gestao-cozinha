import {
  Eye,
  PackageSearch,
  Utensils,
} from "lucide-react";

import type { Product } from "@/types";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

import {
  formatCurrency,
  formatDate,
  formatQuantity,
} from "@/lib/format";

import { getStatusInfo } from "@/lib/produto-status";

import styles from "./KitchenStockTable.module.css";

interface KitchenStockTableProps {
  produtos: Product[];
  onUsarNaProducao: (
    produto: Product,
  ) => void;
  onVerDetalhes?: (
    produto: Product,
  ) => void;
}

export function KitchenStockTable({
  produtos,
  onUsarNaProducao,
  onVerDetalhes,
}: KitchenStockTableProps) {
  if (produtos.length === 0) {
    return (
      <div className={styles.empty}>
        <PackageSearch
          size={36}
          aria-hidden="true"
        />

        <p className={styles.emptyTitle}>
          Nenhum ingrediente encontrado
        </p>

        <p className={styles.emptyText}>
          Ajuste a busca ou os filtros para
          visualizar outros itens.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Ingrediente</th>
            <th scope="col">Categoria</th>
            <th scope="col">Lote</th>
            <th scope="col">Validade</th>

            <th
              scope="col"
              className={styles.numeric}
            >
              Quantidade
            </th>

            <th
              scope="col"
              className={styles.numeric}
            >
              Custo unitário
            </th>

            <th scope="col">Situação</th>

            <th scope="col">
              <span className={styles.srOnly}>
                Ações operacionais
              </span>
            </th>
          </tr>
        </thead>

        <tbody>
          {produtos.map((produto) => {
            const status = getStatusInfo(
              produto.situacao,
            );

            const bloqueado =
              produto.situacao === "vencido" ||
              produto.quantidade <= 0;

            return (
              <tr
                key={`${produto.id}-${produto.lote}`}
                className={
                  bloqueado
                    ? styles.blockedRow
                    : undefined
                }
              >
                <td>
                  <div
                    className={
                      styles.productCell
                    }
                  >
                    <div
                      className={
                        styles.productIcon
                      }
                    >
                      <Utensils
                        size={17}
                        aria-hidden="true"
                      />
                    </div>

                    <div>
                      <strong
                        className={
                          styles.productName
                        }
                      >
                        {produto.nome}
                      </strong>

                      <span
                        className={
                          styles.productDescription
                        }
                      >
                        Disponível para produção
                      </span>
                    </div>
                  </div>
                </td>

                <td>{produto.categoria}</td>

                <td className={styles.mono}>
                  {produto.lote}
                </td>

                <td>
                  {formatDate(produto.validade)}
                </td>

                <td className={styles.numeric}>
                  {formatQuantity(
                    produto.quantidade,
                    produto.unidade,
                  )}
                </td>

                <td className={styles.numeric}>
                  {formatCurrency(
                    produto.custoUnitario,
                  )}
                </td>

                <td>
                  <Badge
                    variant={status.variant}
                  >
                    {status.label}
                  </Badge>
                </td>

                <td className={styles.actions}>
                  {onVerDetalhes && (
                    <Button
                      type="button"
                      size="small"
                      variant="ghost"
                      aria-label={`Ver detalhes de ${produto.nome}`}
                      onClick={() =>
                        onVerDetalhes(produto)
                      }
                    >
                      <Eye
                        size={16}
                        aria-hidden="true"
                      />
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="small"
                    variant="primary"
                    leftIcon={
                      <Utensils size={16} />
                    }
                    onClick={() =>
                      onUsarNaProducao(produto)
                    }
                    disabled={bloqueado}
                  >
                    {bloqueado
                      ? "Bloqueado"
                      : "Usar na produção"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}