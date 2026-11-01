"use client";

import { useMemo, useState } from "react";

import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  Plus,
  Search,
  Soup,
  UserRound,
} from "lucide-react";

import type { Production, ProductionStatus } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { StockCard } from "@/components/estoque/StockCard";

import {
  NewProductionModal,
  type NewProductionPayload,
} from "@/components/producao/NewProductionModal";

import { producoes as producoesIniciais } from "@/services/producao";
import { usuarioProducao } from "@/services/usuarios";
import { proximoStatus } from "@/lib/producao-status";
import { formatDate } from "@/lib/format";

import styles from "./page.module.css";

type Filtro = ProductionStatus | "todas";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "planejada", label: "Planejadas" },
  { value: "em-andamento", label: "Em preparo" },
  { value: "concluida", label: "Concluídas" },
];

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function dataLocalHoje() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

export default function ProducaoPage() {
  const [lista, setLista] = useState<Production[]>(producoesIniciais);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [modalAberto, setModalAberto] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const indicadores = useMemo(
    () => ({
      total: lista.length,
      planejadas: lista.filter((p) => p.status === "planejada").length,
      emAndamento: lista.filter((p) => p.status === "em-andamento").length,
      concluidas: lista.filter((p) => p.status === "concluida").length,
    }),
    [lista],
  );

  const producoesFiltradas = useMemo(() => {
    const termo = normalizar(busca);

    return lista.filter((producao) => {
      const texto = normalizar(
        `${producao.prato} ${producao.codigo} ${producao.responsavel}`,
      );

      return (
        (termo === "" || texto.includes(termo)) &&
        (filtro === "todas" || producao.status === filtro)
      );
    });
  }, [lista, busca, filtro]);

  const filtrosAtivos = busca.trim() !== "" || filtro !== "todas";

  function abrirNovaProducao() {
    setFeedback(null);
    setModalAberto(true);
  }

  function limparFiltros() {
    setBusca("");
    setFiltro("todas");
  }

  function registrarProducao(payload: NewProductionPayload) {
    const ano = new Date().getFullYear();
    const prefixo = `PRD-${ano}-`;

    // Procura a maior sequência existente para o ano.
    const maiorSequencia = lista.reduce((maior, producao) => {
      if (!producao.codigo.startsWith(prefixo)) return maior;

      const numero = Number(producao.codigo.slice(prefixo.length));

      return Number.isSafeInteger(numero)
        ? Math.max(maior, numero)
        : maior;
    }, 0);

    const nova: Production = {
      id: crypto.randomUUID(),
      codigo: `${prefixo}${String(maiorSequencia + 1).padStart(4, "0")}`,
      prato: payload.prato,
      categoria: payload.categoria,
      quantidade: payload.quantidade,
      unidade: payload.unidade,
      responsavel: usuarioProducao.nome,
      dataProducao: dataLocalHoje(),
      status: "planejada",
      insumos: [],
    };

    setLista((atual) => [nova, ...atual]);
    setModalAberto(false);

    // Permite encontrar a produção recém-criada.
    limparFiltros();

    setFeedback(
      `Produção de ${payload.prato} registrada. Toque em “Iniciar preparo” quando começar.`,
    );
  }

  function avancarStatus(alvo: Production) {
    if (alvo.status === "concluida") return;

    const proximo = proximoStatus(alvo.status);

    setLista((atual) =>
      atual.map((producao) =>
        producao.id === alvo.id && producao.status === alvo.status
          ? { ...producao, status: proximo }
          : producao,
      ),
    );

    setFeedback(
      proximo === "em-andamento"
        ? `Preparo de ${alvo.prato} iniciado. Código ${alvo.codigo}.`
        : `Produção de ${alvo.prato} concluída. Código ${alvo.codigo}.`,
    );
  }

  return (
    <AppLayout
      user={usuarioProducao}
      title="Produção"
      subtitle="Organize o preparo e acompanhe o que está pronto."
      headerActions={
        <Button
          leftIcon={<Plus size={20} />}
          onClick={abrirNovaProducao}
        >
          Nova produção
        </Button>
      }
    >
      <div className={styles.wrapper}>
        <div role="status" aria-live="polite" aria-atomic="true">
          {feedback && (
            <Alert
              variant="success"
              title="Produção atualizada"
              onClose={() => setFeedback(null)}
            >
              {feedback}
            </Alert>
          )}
        </div>

        <section
          className={styles.indicators}
          aria-label="Resumo das produções"
        >
          <StockCard
            label="Total de produções"
            value={String(indicadores.total)}
            icon={<Soup size={24} />}
            tone="primary"
          />

          <StockCard
            label="Planejadas"
            value={String(indicadores.planejadas)}
            icon={<ClipboardCheck size={24} />}
            tone="info"
          />

          <StockCard
            label="Em preparo"
            value={String(indicadores.emAndamento)}
            icon={<ChefHat size={24} />}
            tone="warning"
          />

          <StockCard
            label="Concluídas"
            value={String(indicadores.concluidas)}
            icon={<CheckCircle2 size={24} />}
            tone="success"
          />
        </section>

        <section
          className={styles.workspace}
          aria-labelledby="titulo-producoes"
        >
          <div className={styles.sectionHeader}>
            <div>
              <h2 id="titulo-producoes">Acompanhar produções</h2>
              <p>
                Inicie o preparo e marque como concluído quando terminar.
              </p>
            </div>

            <span className={styles.sectionIcon} aria-hidden="true">
              <ChefHat size={28} />
            </span>
          </div>

          <div className={styles.toolbar}>
            <Input
              id="busca-producao"
              type="search"
              label="Buscar produção"
              placeholder="Produto, código ou responsável"
              leftIcon={<Search size={20} />}
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />

            <Button
              variant="secondary"
              onClick={limparFiltros}
              disabled={!filtrosAtivos}
            >
              Limpar filtros
            </Button>
          </div>

          <div
            className={styles.filters}
            role="group"
            aria-label="Filtrar pela situação da produção"
          >
            {FILTROS.map((opcao) => (
              <Button
                key={opcao.value}
                variant={filtro === opcao.value ? "primary" : "secondary"}
                aria-pressed={filtro === opcao.value}
                onClick={() => setFiltro(opcao.value)}
              >
                {opcao.label}
              </Button>
            ))}
          </div>

          <p className={styles.results} role="status" aria-live="polite">
            Mostrando <strong>{producoesFiltradas.length}</strong> de{" "}
            <strong>{lista.length}</strong> produções
          </p>

          {producoesFiltradas.length > 0 ? (
            <div className={styles.cards}>
              {producoesFiltradas.map((producao) => {
                const concluida = producao.status === "concluida";
                const emPreparo = producao.status === "em-andamento";

                const statusLabel = concluida
                  ? "Concluída"
                  : emPreparo
                    ? "Em preparo"
                    : "Planejada";

                const StatusIcon = concluida
                  ? CheckCircle2
                  : emPreparo
                    ? ChefHat
                    : ClipboardCheck;

                const statusClass = concluida
                  ? styles.completed
                  : emPreparo
                    ? styles.inProgress
                    : styles.planned;

                return (
                  <article
                    key={producao.id}
                    className={styles.card}
                    aria-labelledby={`producao-${producao.id}`}
                  >
                    <div className={styles.cardTop}>
                      <span className={`${styles.status} ${statusClass}`}>
                        <StatusIcon size={18} aria-hidden="true" />
                        {statusLabel}
                      </span>

                      <span className={styles.code}>
                        {producao.codigo}
                      </span>
                    </div>

                    <div className={styles.product}>
                      <p className={styles.category}>
                        {producao.categoria}
                      </p>

                      <h3 id={`producao-${producao.id}`}>
                        {producao.prato}
                      </h3>
                    </div>

                    <div className={styles.quantity}>
                      <span>Quantidade da produção</span>
                      <p>
                        <strong>{producao.quantidade}</strong>{" "}
                        {producao.unidade}
                      </p>
                    </div>

                    <dl className={styles.details}>
                      <div>
                        <dt>
                          <UserRound size={18} aria-hidden="true" />
                          Responsável
                        </dt>
                        <dd>{producao.responsavel}</dd>
                      </div>

                      <div>
                        <dt>
                          <CalendarDays size={18} aria-hidden="true" />
                          Data da produção
                        </dt>
                        <dd>{formatDate(producao.dataProducao)}</dd>
                      </div>
                    </dl>

                    <div className={styles.cardFooter}>
                      {concluida ? (
                        <p className={styles.completedMessage}>
                          <CheckCircle2 size={20} aria-hidden="true" />
                          Produção finalizada
                        </p>
                      ) : (
                        <Button
                          fullWidth
                          variant={emPreparo ? "success" : "primary"}
                          leftIcon={
                            emPreparo
                              ? <CheckCircle2 size={22} />
                              : <ChefHat size={22} />
                          }
                          onClick={() => avancarStatus(producao)}
                          aria-label={`${
                            emPreparo
                              ? "Concluir produção"
                              : "Iniciar preparo"
                          } de ${producao.prato}, ${producao.codigo}`}
                        >
                          {emPreparo
                            ? "Concluir produção"
                            : "Iniciar preparo"}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              <Soup size={40} aria-hidden="true" />

              <h3>
                {lista.length === 0
                  ? "Nenhuma produção cadastrada"
                  : "Nenhuma produção encontrada"}
              </h3>

              <p>
                {lista.length === 0
                  ? "Cadastre o primeiro preparo para começar."
                  : "Tente outro nome ou altere os filtros."}
              </p>

              <Button
                variant={lista.length === 0 ? "primary" : "secondary"}
                onClick={
                  lista.length === 0
                    ? abrirNovaProducao
                    : limparFiltros
                }
              >
                {lista.length === 0 ? "Nova produção" : "Limpar filtros"}
              </Button>
            </div>
          )}
        </section>
      </div>

      <NewProductionModal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onConfirm={registrarProducao}
      />
    </AppLayout>
  );
}