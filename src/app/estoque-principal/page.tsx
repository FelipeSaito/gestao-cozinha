"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  Boxes,
  CalendarClock,
  CircleDollarSign,
  FileUp,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";

import type {
  Product,
  ProductStatus,
} from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

import { StockCard } from "@/components/estoque/StockCard";
import { StockTable } from "@/components/estoque/StockTable";

import {
  TransferModal,
  type TransferPayload,
} from "@/components/estoque/TransferModal";

import { EntradaProdutoModal } from "@/components/estoque/EntradaProdutoModal";
import { ImportarXmlModal } from "@/components/estoque/ImportarXmlModal";
import { HistoricoEstoque } from "@/components/estoque/HistoricoEstoque";

import { useInventory } from "@/contexts/InventoryContext";
import { usuarioEstoque } from "@/services/usuarios";
import { STATUS_FILTER_OPTIONS } from "@/lib/produto-status";
import { formatCurrency } from "@/lib/format";

import styles from "./page.module.css";

type Filtro =
  | ProductStatus
  | "todas";

function normalizarTexto(
  texto: string,
) {
  return texto
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .trim();
}

export default function EstoquePrincipalPage() {
  const {
    produtos,
    criarTransferencia:
      registrarTransferencia,
    atualizarInventario,
    carregando,
    erro,
  } = useInventory();

  const [busca, setBusca] =
    useState("");

  const [filtro, setFiltro] =
    useState<Filtro>("todas");

  const [
    produtoSelecionado,
    setProdutoSelecionado,
  ] = useState<Product | null>(
    null,
  );

  const [
    modalAberto,
    setModalAberto,
  ] = useState(false);

  const [
    entradaAberta,
    setEntradaAberta,
  ] = useState(false);

  const [
    xmlAberto,
    setXmlAberto,
  ] = useState(false);

  const [
    sucesso,
    setSucesso,
  ] = useState<string | null>(
    null,
  );

  const indicadores = useMemo(
    () => ({
      totalInsumos:
        produtos.length,

      estoqueBaixo:
        produtos.filter(
          (produto) =>
            produto.situacao ===
            "estoque-baixo",
        ).length,

      proximosVencimento:
        produtos.filter(
          (produto) =>
            produto.situacao ===
            "proximo-vencimento",
        ).length,

      valorEstimado:
        produtos.reduce(
          (total, produto) =>
            total +
            produto.quantidade *
              produto.custoUnitario,
          0,
        ),
    }),
    [produtos],
  );

  const produtosFiltrados =
    useMemo(() => {
      const termo =
        normalizarTexto(busca);

      return produtos.filter(
        (produto) => {
          const texto =
            normalizarTexto(
              `${produto.nome} ${produto.categoria} ${produto.lote}`,
            );

          const combinaBusca =
            termo === "" ||
            texto.includes(termo);

          const combinaFiltro =
            filtro === "todas" ||
            produto.situacao ===
              filtro;

          return (
            combinaBusca &&
            combinaFiltro
          );
        },
      );
    }, [
      busca,
      filtro,
      produtos,
    ]);

  const filtrosAtivos =
    busca.trim() !== "" ||
    filtro !== "todas";

  function abrirTransferencia(
    produto: Product,
  ) {
    setProdutoSelecionado(
      produto,
    );

    setModalAberto(true);
    setSucesso(null);
  }

  function fecharModal() {
    setModalAberto(false);
    setProdutoSelecionado(
      null,
    );
  }

  function limparFiltros() {
    setBusca("");
    setFiltro("todas");
  }

  async function criarTransferencia({
    produto,
    quantidade,
    observacao,
  }: TransferPayload) {
    await registrarTransferencia({
      produtoId: produto.id,
      quantidade,
      observacao,
    });

    fecharModal();

    setSucesso(
      `Transferência de ${quantidade} ${produto.unidade} de ${produto.nome} criada. Confirme o recebimento na tela de Transferências para adicionar os itens ao estoque da cozinha.`,
    );
  }

  const acoes = (
    <>
      <Button
        variant="secondary"
        leftIcon={
          <FileUp size={20} />
        }
        onClick={() => {
          setSucesso(null);
          setXmlAberto(true);
        }}
      >
        Importar XML
      </Button>

      <Button
        variant="primary"
        leftIcon={
          <Plus size={20} />
        }
        onClick={() => {
          setSucesso(null);
          setEntradaAberta(true);
        }}
      >
        Registrar entrada
      </Button>
    </>
  );

  return (
    <AppLayout
      user={usuarioEstoque}
      title="Estoque principal"
      subtitle="Consulte os ingredientes e envie para a cozinha."
      headerActions={acoes}
    >
      <div
        className={
          styles.wrapper
        }
      >
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {carregando && (
            <p>
              Carregando estoque...
            </p>
          )}

          {erro && (
            <Alert
              variant="danger"
              title="Não foi possível atualizar o estoque"
            >
              {erro}
            </Alert>
          )}

          {sucesso && (
            <Alert
              variant="success"
              title="Operação concluída"
              onClose={() =>
                setSucesso(null)
              }
            >
              {sucesso}
            </Alert>
          )}
        </div>

        <section
          className={
            styles.indicators
          }
          aria-label="Resumo do estoque principal"
        >
          <StockCard
            label="Itens cadastrados"
            value={String(
              indicadores.totalInsumos,
            )}
            icon={
              <Boxes size={24} />
            }
            tone="primary"
          />

          <StockCard
            label="Estoque baixo"
            value={String(
              indicadores.estoqueBaixo,
            )}
            icon={
              <TriangleAlert
                size={24}
              />
            }
            tone="warning"
          />

          <StockCard
            label="Próximos do vencimento"
            value={String(
              indicadores.proximosVencimento,
            )}
            icon={
              <CalendarClock
                size={24}
              />
            }
            tone="danger"
          />

          <StockCard
            label="Valor estimado"
            value={formatCurrency(
              indicadores.valorEstimado,
            )}
            icon={
              <CircleDollarSign
                size={24}
              />
            }
            tone="success"
          />
        </section>

        <section
          className={
            styles.tableCard
          }
          aria-labelledby="titulo-ingredientes"
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <h2 id="titulo-ingredientes">
              Ingredientes disponíveis
            </h2>

            <p>
              Encontre o ingrediente
              e toque em{" "}
              <strong>
                Transferir
              </strong>{" "}
              para informar a
              quantidade.
            </p>
          </div>

          <div
            className={
              styles.toolbar
            }
          >
            <div
              className={
                styles.searchBox
              }
            >
              <Input
                id="busca-ingredientes"
                type="search"
                label="Buscar ingrediente"
                placeholder="Nome, categoria ou lote"
                leftIcon={
                  <Search size={20} />
                }
                value={busca}
                onChange={(event) =>
                  setBusca(
                    event.target.value,
                  )
                }
              />
            </div>

            <div
              className={
                styles.filterBox
              }
            >
              <label
                htmlFor="filtro-situacao"
                className={
                  styles.filterLabel
                }
              >
                Situação do estoque
              </label>

              <select
                id="filtro-situacao"
                className={
                  styles.select
                }
                value={filtro}
                onChange={(event) =>
                  setFiltro(
                    event.target
                      .value as Filtro,
                  )
                }
              >
                {STATUS_FILTER_OPTIONS.map(
                  (opcao) => (
                    <option
                      key={
                        opcao.value
                      }
                      value={
                        opcao.value
                      }
                    >
                      {opcao.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <Button
              variant="secondary"
              onClick={
                limparFiltros
              }
              disabled={
                !filtrosAtivos
              }
            >
              Limpar filtros
            </Button>
          </div>

          <div
            className={
              styles.results
            }
          >
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              Mostrando{" "}
              <strong>
                {
                  produtosFiltrados.length
                }
              </strong>{" "}
              de{" "}
              <strong>
                {produtos.length}
              </strong>{" "}
              itens
            </p>

            <p
              className={
                styles.tableHint
              }
              id="dica-tabela"
            >
              Se necessário,
              deslize a tabela para
              os lados para
              encontrar todas as
              informações e o botão
              Transferir.
            </p>
          </div>

          <div
            className={
              styles.tableArea
            }
            role="region"
            aria-label="Tabela de ingredientes"
            aria-describedby="dica-tabela"
            tabIndex={0}
          >
            <StockTable
              produtos={
                produtosFiltrados
              }
              onTransferir={
                abrirTransferencia
              }
            />
          </div>
        </section>

        <HistoricoEstoque
          produtos={produtos}
          onCorrigido={async () => {
            await atualizarInventario();
          }}
        />
      </div>

      {produtoSelecionado && (
        <TransferModal
          key={
            produtoSelecionado.id
          }
          open={modalAberto}
          produto={
            produtoSelecionado
          }
          onClose={fecharModal}
          onConfirm={
            criarTransferencia
          }
        />
      )}

      <EntradaProdutoModal
        open={entradaAberta}
        onClose={() =>
          setEntradaAberta(false)
        }
        onSaved={async (nome) => {
          setSucesso(
            `Entrada de ${nome} registrada no estoque principal.`,
          );

          await atualizarInventario();
        }}
      />

      <ImportarXmlModal
        open={xmlAberto}
        onClose={() =>
          setXmlAberto(false)
        }
        onSaved={async (
          importados,
          repetidos,
        ) => {
          if (
            importados === 0 &&
            repetidos > 0
          ) {
            setSucesso(
              "Esta NF-e já havia sido importada. Nenhuma quantidade foi adicionada novamente.",
            );
          } else if (
            repetidos > 0
          ) {
            setSucesso(
              `${importados} produtos foram importados e ${repetidos} já estavam registrados.`,
            );
          } else {
            setSucesso(
              `${importados} ${
                importados === 1
                  ? "produto foi importado"
                  : "produtos foram importados"
              } da NF-e para o estoque principal.`,
            );
          }

          await atualizarInventario();
        }}
      />
    </AppLayout>
  );
}