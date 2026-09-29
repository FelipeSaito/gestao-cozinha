"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  CalendarClock,
  CircleDollarSign,
  Search,
  TriangleAlert,
} from "lucide-react";

import type { Product, ProductStatus } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { StockCard } from "@/components/estoque/StockCard";
import { KitchenStockTable } from "@/components/estoque-cozinha/KitchenStockTable";
import { ConsumoCozinhaModal } from "@/components/estoque/ConsumoCozinhaModal";
import { HistoricoConsumos } from "@/components/estoque/HistoricoConsumos";

import { useInventory } from "@/contexts/InventoryContext";
import { usuarioProducao } from "@/services/usuarios";
import { STATUS_FILTER_OPTIONS } from "@/lib/produto-status";
import { formatCurrency } from "@/lib/format";

import styles from "./page.module.css";

type Filtro = ProductStatus | "todas";

export default function EstoqueCozinhaPage() {
  const { estoqueCozinha, atualizarInventario } = useInventory();

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [produtoSelecionado, setProdutoSelecionado] = useState<Product | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [atualizacaoHistorico, setAtualizacaoHistorico] = useState(0);

  const indicadores = useMemo(
    () => ({
      totalItens: estoqueCozinha.length,
      estoqueBaixo: estoqueCozinha.filter(
        (produto) => produto.situacao === "estoque-baixo",
      ).length,
      proximosVencimento: estoqueCozinha.filter(
        (produto) => produto.situacao === "proximo-vencimento",
      ).length,
      valorEstimado: estoqueCozinha.reduce(
        (total, produto) =>
          total + produto.quantidade * produto.custoUnitario,
        0,
      ),
    }),
    [estoqueCozinha],
  );

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return estoqueCozinha.filter((produto) => {
      const combinaBusca =
        termo === "" ||
        produto.nome.toLowerCase().includes(termo) ||
        produto.categoria.toLowerCase().includes(termo) ||
        produto.lote.toLowerCase().includes(termo);

      const combinaFiltro = filtro === "todas" || produto.situacao === filtro;

      return combinaBusca && combinaFiltro;
    });
  }, [estoqueCozinha, busca, filtro]);

  const filtrosAtivos = busca !== "" || filtro !== "todas";

  function limparFiltros() {
    setBusca("");
    setFiltro("todas");
  }

  function usarNaProducao(produto: Product) {
    setFeedback(null);
    setProdutoSelecionado(produto);
  }

  return (
    <AppLayout
      user={usuarioProducao}
      title="Estoque da cozinha"
      subtitle="Ingredientes já recebidos e disponíveis para o preparo."
    >
      <div className={styles.wrapper}>
        <div role="status" aria-live="polite" aria-atomic="true">
          {feedback && (
            <Alert
              variant="success"
              title="Consumo registrado"
              onClose={() => setFeedback(null)}
            >
              {feedback}
            </Alert>
          )}
        </div>

        <section
          className={styles.indicators}
          aria-label="Resumo do estoque da cozinha"
        >
          <StockCard
            label="Itens na cozinha"
            value={String(indicadores.totalItens)}
            icon={<Boxes size={24} />}
            tone="primary"
          />

          <StockCard
            label="Estoque baixo"
            value={String(indicadores.estoqueBaixo)}
            icon={<TriangleAlert size={24} />}
            tone="warning"
          />

          <StockCard
            label="Próximos do vencimento"
            value={String(indicadores.proximosVencimento)}
            icon={<CalendarClock size={24} />}
            tone="danger"
          />

          <StockCard
            label="Valor estimado"
            value={formatCurrency(indicadores.valorEstimado)}
            icon={<CircleDollarSign size={24} />}
            tone="success"
          />
        </section>

        <section
          className={styles.tableCard}
          aria-labelledby="titulo-cozinha"
        >
          <div className={styles.sectionHeader}>
            <h2 id="titulo-cozinha">Ingredientes na cozinha</h2>
            <p>
              Estes itens chegaram pelas transferências confirmadas. Toque em{" "}
              <strong>Usar na produção</strong> para registrar o consumo.
            </p>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <Input
                id="busca-cozinha"
                type="search"
                label="Buscar ingrediente"
                placeholder="Nome, categoria ou lote"
                leftIcon={<Search size={20} />}
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
              />
            </div>

            <div className={styles.filterBox}>
              <label htmlFor="filtro-cozinha" className={styles.filterLabel}>
                Situação do estoque
              </label>

              <select
                id="filtro-cozinha"
                className={styles.select}
                value={filtro}
                onChange={(event) => setFiltro(event.target.value as Filtro)}
              >
                {STATUS_FILTER_OPTIONS.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="secondary"
              onClick={limparFiltros}
              disabled={!filtrosAtivos}
            >
              Limpar filtros
            </Button>
          </div>

          <div className={styles.results}>
            <p role="status" aria-live="polite" aria-atomic="true">
              Mostrando <strong>{produtosFiltrados.length}</strong> de{" "}
              <strong>{estoqueCozinha.length}</strong> itens
            </p>

            <p className={styles.tableHint} id="dica-cozinha">
              Se necessário, deslize a tabela para os lados para encontrar
              todas as informações e o botão Usar na produção.
            </p>
          </div>

          <div
            className={styles.tableArea}
            role="region"
            aria-label="Tabela do estoque da cozinha"
            aria-describedby="dica-cozinha"
            tabIndex={0}
          >
            <KitchenStockTable
              produtos={produtosFiltrados}
              onUsarNaProducao={usarNaProducao}
            />
          </div>
        </section>
        <HistoricoConsumos atualizacao={atualizacaoHistorico} />
      </div>

      {produtoSelecionado && (
        <ConsumoCozinhaModal
          key={produtoSelecionado.id}
          produto={produtoSelecionado}
          onClose={() => setProdutoSelecionado(null)}
          onConcluido={async () => {
            setFeedback(`O consumo de ${produtoSelecionado.nome} foi registrado.`);
            setAtualizacaoHistorico((atual) => atual + 1);
            await atualizarInventario();
          }}
        />
      )}
    </AppLayout>
  );
}
