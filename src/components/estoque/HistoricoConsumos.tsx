"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { consultarConsumosCozinha, type ConsumoRegistrado } from "@/services/consumosEstoque";
import { formatQuantity } from "@/lib/format";
import styles from "./HistoricoConsumos.module.css";

interface Props {
  atualizacao: number;
}

function dataHora(valor: string | null) {
  if (!valor) return "Data não disponível";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "Data não disponível" :
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
    }).format(data);
}

export function HistoricoConsumos({ atualizacao }: Props) {
  const { usuario } = useAuth();
  const [consumos, setConsumos] = useState<ConsumoRegistrado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!usuario) return;
    let ativo = true;
    void consultarConsumosCozinha().then((dados) => {
      if (!ativo) return;
      setConsumos(dados);
      setErro(null);
    }).catch((falha: unknown) => {
      if (ativo) setErro(falha instanceof Error ? falha.message : "Erro ao carregar o histórico.");
    }).finally(() => {
      if (ativo) setCarregando(false);
    });
    return () => { ativo = false; };
  }, [usuario, atualizacao]);

  return (
    <section className={styles.card} aria-labelledby="titulo-historico-consumos">
      <h2 id="titulo-historico-consumos">Consumos recentes</h2>
      <p>Últimos 30 registros do estoque da cozinha.</p>

      {carregando && <p role="status">Carregando consumos...</p>}
      {erro && <p role="alert">{erro}</p>}
      {!carregando && !erro && consumos.length === 0 && <p>Nenhum consumo registrado.</p>}

      {!erro && consumos.length > 0 && (
        <ul className={styles.list}>
          {consumos.map((consumo) => (
            <li key={consumo.id} className={styles.item}>
              <div className={styles.heading}>
                <strong>{consumo.nome}</strong>
                <time dateTime={consumo.registradoEm ?? undefined}>
                  {dataHora(consumo.registradoEm)}
                </time>
              </div>
              <p>
                {formatQuantity(consumo.quantidade, consumo.unidade)} usados · lote {consumo.lote}
              </p>
              <p>Finalidade: {consumo.finalidade}</p>
              <p>
                Ordem: {consumo.ordemCodigo && consumo.ordemPrato
                  ? `${consumo.ordemCodigo} · ${consumo.ordemPrato}`
                  : "Registro anterior ao vínculo com ordens"}
              </p>
              <p>Por {consumo.registradoPor} · saldo: {formatQuantity(consumo.saldoAnterior, consumo.unidade)} → {formatQuantity(consumo.saldoNovo, consumo.unidade)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
