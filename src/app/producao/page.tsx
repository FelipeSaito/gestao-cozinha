"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  Plus,
  Search,
  Soup,
  UserRound,
  Wheat,
} from "lucide-react";
import type {
  Production,
  ProductionStatus,
} from "@/types";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { StockCard } from "@/components/estoque/StockCard";
import { ConsumosDaOrdem } from "@/components/producao/ConsumosDaOrdem";
import {
  NewProductionModal,
  type NewProductionPayload,
} from "@/components/producao/NewProductionModal";
import {
  MassProductionPlanner,
  type MassProductionPlannerPayload,
} from "@/components/producao/MassProductionPlanner";
import {
  ConclusaoMassaModal,
  type ConclusaoMassaPayload,
} from "@/components/producao/ConclusaoMassaModal";
import {
  listarOrdens,
  criarOrdem,
  avancarOrdem,
  type OrdemRemota,
} from "@/services/ordensProducao";
import { useAuth } from "@/contexts/AuthContext";
import { usuarioProducao } from "@/services/usuarios";
import { formatDate } from "@/lib/format";
import styles from "./page.module.css";
type Filtro = ProductionStatus | "todas";
const FILTROS: {
  value: Filtro;
  label: string;
}[] = [
  {
    value: "todas",
    label: "Todas",
  },
  {
    value: "planejada",
    label: "Planejadas",
  },
  {
    value: "em-andamento",
    label: "Em preparo",
  },
  {
    value: "concluida",
    label: "Concluídas",
  },
];
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function inicioDaSemanaBrasil(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  const hoje = new Date(Date.UTC(Number(valor("year")), Number(valor("month")) - 1, Number(valor("day"))));
  const diasDesdeSegunda = (hoje.getUTCDay() + 6) % 7;
  hoje.setUTCDate(hoje.getUTCDate() - diasDesdeSegunda);
  return hoje.toISOString().slice(0, 10);
}
function criarId(prefixo: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefixo}-${crypto.randomUUID()}`;
  }
  return `${prefixo}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}
const NOMES_ETAPAS_MASSA: Record<
  NonNullable<OrdemRemota["etapaMassa"]>,
  string
> = {
  planejamento: "Planejamento",
  mistura: "Mistura",
  "formacao-blocos": "Formação dos blocos",
  esticamento: "Esticamento",
  enrolamento: "Enrolamento",
  armazenamento: "Armazenamento",
  concluida: "Concluída",
};

const ACOES_ETAPAS_MASSA: Record<
  NonNullable<OrdemRemota["etapaMassa"]>,
  string
> = {
  planejamento: "Iniciar preparo",
  mistura: "Avançar para formação dos blocos",
  "formacao-blocos": "Avançar para esticamento",
  esticamento: "Avançar para enrolamento",
  enrolamento: "Avançar para armazenamento",
  armazenamento: "Concluir e registrar rendimento",
  concluida: "Produção concluída",
};

export default function ProducaoPage() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState<OrdemRemota[]>([]);
  const [
    producaoParaConcluir,
    setProducaoParaConcluir,
  ] = useState<OrdemRemota | null>(null);
  const [inicioSemana, setInicioSemana] = useState(inicioDaSemanaBrasil);
  useEffect(() => {
    const relogio = window.setInterval(() => setInicioSemana(inicioDaSemanaBrasil()), 60_000);
    return () => window.clearInterval(relogio);
  }, []);
  const [carregandoOrdens, setCarregandoOrdens] = useState(true);
  const [erroOrdens, setErroOrdens] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [statusEmAtualizacao, setStatusEmAtualizacao] = useState<string | null>(null);
  const operacao = useRef<string | null>(null);
  const envioEmAndamento = useRef(false);
  useEffect(() => {
    if (!usuario?.id) return;
    let ativo = true;
    void listarOrdens().then((ordens) => {
      if (ativo) { setLista(ordens); setErroOrdens(null); }
    }).catch((falha: unknown) => {
      if (ativo) setErroOrdens(falha instanceof Error ? falha.message : "Erro ao carregar as ordens.");
    }).finally(() => { if (ativo) setCarregandoOrdens(false); });
    return () => { ativo = false; };
  }, [usuario?.id]);
  const [busca, setBusca] =
    useState("");
  const [filtro, setFiltro] =
    useState<Filtro>("todas");
  const [
    modalAberto,
    setModalAberto,
  ] = useState(false);
  const [
    planejadorMassaAberto,
    setPlanejadorMassaAberto,
  ] = useState(false);
  const [feedback, setFeedback] =
    useState<string | null>(null);
  const listaVisivel = useMemo(() => lista.filter((producao) =>
    producao.status !== "concluida" || producao.dataProducao >= inicioSemana,
  ), [lista, inicioSemana]);
  const indicadores = useMemo(
    () => ({
      total: listaVisivel.length,
      planejadas: listaVisivel.filter(
        (producao) =>
          producao.status === "planejada",
      ).length,
      emAndamento: listaVisivel.filter(
        (producao) =>
          producao.status ===
          "em-andamento",
      ).length,
      concluidas: listaVisivel.filter(
        (producao) =>
          producao.status === "concluida",
      ).length,
    }),
    [listaVisivel],
  );
  const producoesFiltradas =
    useMemo(() => {
      const termo = normalizar(busca);
      return listaVisivel.filter(
        (producao) => {
          const texto = normalizar(
            [
              producao.prato,
              producao.codigo,
              producao.responsavel,
              producao.categoria,
            ].join(" "),
          );
          const combinaBusca =
            termo === "" ||
            texto.includes(termo);
          const combinaFiltro =
            filtro === "todas" ||
            producao.status === filtro;
          return (
            combinaBusca &&
            combinaFiltro
          );
        },
      );
    }, [listaVisivel, busca, filtro]);
  const filtrosAtivos =
    busca.trim() !== "" ||
    filtro !== "todas";
  function limparFiltros() {
    setBusca("");
    setFiltro("todas");
  }
  function abrirNovaProducao() {
    setFeedback(null);
    setErroOrdens(null);
    operacao.current = null;
    setPlanejadorMassaAberto(false);
    setModalAberto(true);
  }
  function alternarPlanejadorMassa() {
    setFeedback(null);
    setErroOrdens(null);
    operacao.current = null;
    setModalAberto(false);
    setPlanejadorMassaAberto(
      (aberto) => !aberto,
    );
  }
  async function registrarProducao(payload: NewProductionPayload) {
    if (envioEmAndamento.current) return;
    envioEmAndamento.current = true;
    setSalvando(true);
    setErroOrdens(null);
    try {
      operacao.current ??= crypto.randomUUID();
      const nova = await criarOrdem(operacao.current, {
        prato: payload.prato, categoria: payload.categoria,
        quantidade: payload.quantidade, unidade: payload.unidade, insumos: [],
      });
      setLista((atual) => [nova, ...atual.filter((item) => item.id !== nova.id)]);
      operacao.current = null;
      setModalAberto(false);
      limparFiltros();
      setFeedback(`Produção de ${payload.prato} registrada. Ela está aguardando o início do preparo.`);
    } catch (falha) {
      setErroOrdens(falha instanceof Error ? falha.message : "Não foi possível registrar a produção.");
    } finally {
      envioEmAndamento.current = false;
      setSalvando(false);
    }
  }
  async function registrarProducaoMassa(payload: MassProductionPlannerPayload) {
    if (envioEmAndamento.current) return;
    envioEmAndamento.current = true;
    setSalvando(true);
    setErroOrdens(null);
    const insumos: Production["insumos"] = [
        {
          id: criarId("insumo"),
          nome: "Farinha",
          quantidade:
            payload.totais.farinhaKg,
          unidade: "kg",
        },
        {
          id: criarId("insumo"),
          nome: "Ajinomoto",
          quantidade:
            payload.totais.ajinomotoG,
          unidade: "g",
        },
        {
          id: criarId("insumo"),
          nome: "Sal",
          quantidade:
            payload.totais.salG,
          unidade: "g",
        },
        {
          id: criarId("insumo"),
          nome: "Óleo",
          quantidade:
            payload.totais.oleoMl,
          unidade: "ml",
        },
        {
          id: criarId("insumo"),
          nome: "Pinga",
          quantidade:
            payload.totais.pingaMl,
          unidade: "ml",
        },
        {
          id: criarId("insumo"),
          nome: "Água",
          quantidade:
            payload.totais.aguaMl,
          unidade: "ml",
        },
        {
          id: criarId("insumo"),
          nome: "Claras de ovo",
          quantidade:
            payload.totais.clarasOvo,
          unidade: "unidades",
        },
      ];
    try {
      operacao.current ??= crypto.randomUUID();
      const nova = await criarOrdem(operacao.current, {
        prato: "Massa de pastel", categoria: "Massas",
        quantidade: payload.quantidadeDesejadaKg, unidade: "kg", insumos,
      });
      setLista((atual) => [nova, ...atual.filter((item) => item.id !== nova.id)]);
      operacao.current = null;
      setPlanejadorMassaAberto(false);
      limparFiltros();
      setFeedback(`Produção de ${payload.quantidadeDesejadaKg} kg de massa registrada com ${payload.totais.quantidadeBateladas} bateladas.`);
    } catch (falha) {
      setErroOrdens(falha instanceof Error ? falha.message : "Não foi possível registrar a massa.");
    } finally {
      envioEmAndamento.current = false;
      setSalvando(false);
    }
  }
  async function avancarStatus(producaoSelecionada: OrdemRemota) {
    if (producaoSelecionada.status === "concluida" || statusEmAtualizacao) return;
    const massa = producaoSelecionada.prato.trim()
      .toLocaleLowerCase("pt-BR") === "massa de pastel";
    if (massa && producaoSelecionada.etapaMassa === "armazenamento") {
      setFeedback(null);
      setErroOrdens(null);
      setProducaoParaConcluir(producaoSelecionada);
      return;
    }
    setStatusEmAtualizacao(producaoSelecionada.id);
    setErroOrdens(null);
    try {
      const resposta = await avancarOrdem(
        producaoSelecionada.id,
        producaoSelecionada.status,
      );
      setLista((atual) => atual.map((item) =>
        item.id === producaoSelecionada.id
          ? {
              ...item,
              status: resposta.status,
              ...(resposta.etapaMassa
                ? { etapaMassa: resposta.etapaMassa }
                : {}),
              ...(resposta.resultadoMassa
                ? { resultadoMassa: resposta.resultadoMassa }
                : {}),
            }
          : item,
      ));
      if (resposta.status === "concluida") {
        setFeedback(`Produção ${producaoSelecionada.codigo} concluída.`);
      } else if (massa && resposta.etapaMassa) {
        setFeedback(
          `Produção ${producaoSelecionada.codigo} avançou para a etapa ${resposta.etapaMassa}.`,
        );
      } else {
        setFeedback(`Produção ${producaoSelecionada.codigo} iniciada.`);
      }
    } catch (falha) {
      setErroOrdens(
        falha instanceof Error
          ? falha.message
          : "Não foi possível avançar a produção.",
      );
    } finally {
      setStatusEmAtualizacao(null);
    }
  }
  async function concluirProducaoMassa(
  payload: ConclusaoMassaPayload,
) {
  const producao =
    producaoParaConcluir;
  if (
    !producao ||
    statusEmAtualizacao
  ) {
    return;
  }
  setStatusEmAtualizacao(
    producao.id,
  );
  setErroOrdens(null);
  try {
    const resposta =
      await avancarOrdem(
        producao.id,
        producao.status,
        payload.locaisArmazenamento,
        payload.sacosPorLocal,
        payload.quantidadeBlocos,
      );
    setLista((atual) =>
      atual.map((item) =>
        item.id === producao.id
          ? {
              ...item,
              status:
                resposta.status,
              ...(resposta.etapaMassa
                ? {
                    etapaMassa:
                      resposta.etapaMassa,
                  }
                : {}),
              ...(resposta.resultadoMassa
                ? {
                    resultadoMassa:
                      resposta.resultadoMassa,
                  }
                : {}),
            }
          : item,
      ),
    );
    setProducaoParaConcluir(
      null,
    );
    const resultado =
      resposta.resultadoMassa;
    setFeedback(
      resultado
        ? `Produção ${producao.codigo} concluída com ${
            resultado.quantidadeBlocos
          } blocos, ${
            resultado.quantidadeRolos
          } rolos e peso estimado de ${
            resultado.pesoEstimadoKg.toLocaleString(
              "pt-BR",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 3,
              },
            )
          } kg.`
        : `Produção ${producao.codigo} concluída.`,
    );
  } catch (falha) {
    setErroOrdens(
      falha instanceof Error
        ? falha.message
        : "Não foi possível concluir a produção de massa.",
    );
  } finally {
    setStatusEmAtualizacao(
      null,
    );
  }
}
  const acoes = (
    <>
      <Button
        type="button"
        variant="secondary"
        leftIcon={
          <Wheat size={18} />
        }
        onClick={
          alternarPlanejadorMassa
        }
        disabled={salvando}
      >
        {planejadorMassaAberto
          ? "Fechar receita"
          : "Produzir massa"}
      </Button>
      <Button
        type="button"
        variant="primary"
        leftIcon={<Plus size={18} />}
        onClick={abrirNovaProducao}
      >
        Nova produção
      </Button>
    </>
  );
  return (
    <AppLayout
      user={usuarioProducao}
      title="Produção"
      subtitle="Organize o preparo e acompanhe o que está pronto."
      headerActions={acoes}
    >
      <div className={styles.wrapper}>
        {carregandoOrdens && <p role="status">Carregando ordens de produção...</p>}
        {salvando && <p role="status">Salvando produção...</p>}
        {erroOrdens && <Alert variant="danger" onClose={() => setErroOrdens(null)}>{erroOrdens}</Alert>}
        {feedback && (
          <Alert
            variant="success"
            title="Produção atualizada"
            onClose={() =>
              setFeedback(null)
            }
          >
            {feedback}
          </Alert>
        )}
        {planejadorMassaAberto && (
          <MassProductionPlanner
            onConfirm={
              registrarProducaoMassa
            }
          />
        )}
        <section
          className={styles.indicators}
          aria-label="Resumo das produções"
        >
          <StockCard
            label="Total de produções"
            value={String(
              indicadores.total,
            )}
            icon={<Soup size={22} />}
            tone="primary"
          />
          <StockCard
            label="Planejadas"
            value={String(
              indicadores.planejadas,
            )}
            icon={
              <ClipboardCheck
                size={22}
              />
            }
            tone="info"
          />
          <StockCard
            label="Em preparo"
            value={String(
              indicadores.emAndamento,
            )}
            icon={
              <ChefHat size={22} />
            }
            tone="warning"
          />
          <StockCard
            label="Concluídas"
            value={String(
              indicadores.concluidas,
            )}
            icon={
              <CheckCircle2
                size={22}
              />
            }
            tone="success"
          />
        </section>
        <section
          className={styles.workspace}
          aria-labelledby="titulo-producoes"
        >
          <div
            className={
              styles.sectionHeader
            }
          >
            <div>
              <h2 id="titulo-producoes">
                Acompanhar produções
              </h2>
              <p>
                Inicie o preparo e marque
                como concluído quando
                terminar. Produções concluídas de semanas anteriores ficam disponíveis em Relatórios.
              </p>
            </div>
            <span
              className={
                styles.sectionIcon
              }
              aria-hidden="true"
            >
              <ChefHat size={28} />
            </span>
          </div>
          <div
            className={styles.toolbar}
          >
            <Input
              label="Buscar produção"
              placeholder="Produto, código ou responsável"
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
            <Button
              type="button"
              variant="secondary"
              onClick={limparFiltros}
              disabled={!filtrosAtivos}
            >
              Limpar filtros
            </Button>
          </div>
          <div
            className={styles.filters}
            aria-label="Filtrar produções por situação"
          >
            {FILTROS.map((opcao) => {
              const ativo =
                filtro === opcao.value;
              return (
                <Button
                  key={opcao.value}
                  type="button"
                  variant={
                    ativo
                      ? "primary"
                      : "secondary"
                  }
                  size="small"
                  aria-pressed={ativo}
                  onClick={() =>
                    setFiltro(
                      opcao.value,
                    )
                  }
                >
                  {opcao.label}
                </Button>
              );
            })}
          </div>
          <p
            className={styles.results}
            aria-live="polite"
          >
            Mostrando{" "}
            <strong>
              {
                producoesFiltradas.length
              }
            </strong>{" "}
            de{" "}
            <strong>
              {lista.length}
            </strong>{" "}
            produções
          </p>
          {producoesFiltradas.length >
          0 ? (
            <div
              className={styles.cards}
            >
              {producoesFiltradas.map(
                (producao) => {
                  const planejada =
                    producao.status ===
                    "planejada";
                  const emAndamento =
                    producao.status ===
                    "em-andamento";
                  const massa = producao.prato.trim()
                    .toLocaleLowerCase("pt-BR") === "massa de pastel";
                  const rotuloAcao = planejada
                    ? "Iniciar preparo"
                    : massa && producao.etapaMassa
                      ? ACOES_ETAPAS_MASSA[producao.etapaMassa]
                      : "Marcar como concluída";
                  return (
                    <article
                      key={producao.id}
                      className={
                        styles.card
                      }
                    >
                      <div
                        className={
                          styles.cardTop
                        }
                      >
                        <span
                          className={[
                            styles.status,
                            planejada
                              ? styles.planned
                              : emAndamento
                                ? styles.inProgress
                                : styles.completed,
                          ].join(" ")}
                        >
                          {planejada ? (
                            <ClipboardCheck
                              size={17}
                              aria-hidden="true"
                            />
                          ) : emAndamento ? (
                            <ChefHat
                              size={17}
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              size={17}
                              aria-hidden="true"
                            />
                          )}
                          {planejada
                            ? "Planejada"
                            : emAndamento
                              ? "Em preparo"
                              : "Concluída"}
                        </span>
                        <span
                          className={
                            styles.code
                          }
                        >
                          {
                            producao.codigo
                          }
                        </span>
                      </div>
                      <div
                        className={
                          styles.product
                        }
                      >
                        <span
                          className={
                            styles.category
                          }
                        >
                          {
                            producao.categoria
                          }
                        </span>
                        <h3>
                          {producao.prato}
                        </h3>
                      </div>
                      <div
                        className={
                          styles.quantity
                        }
                      >
                        <span>
                          Quantidade da
                          produção
                        </span>
                        <p>
                          <strong>
                            {
                              producao.quantidade
                            }
                          </strong>{" "}
                          {producao.unidade}
                        </p>
                      </div>
                      <dl
                        className={
                          styles.details
                        }
                      >
                        <div>
                          <dt>
                            <UserRound
                              size={18}
                              aria-hidden="true"
                            />
                            Responsável
                          </dt>
                          <dd>
                            {
                              producao.responsavel
                            }
                          </dd>
                        </div>
                        <div>
                          <dt>
                            <CalendarDays
                              size={18}
                              aria-hidden="true"
                            />
                            Data da produção
                          </dt>
                          <dd>
                            {formatDate(
                              producao.dataProducao,
                            )}
                          </dd>
                        </div>
                      </dl>
                      {massa && producao.etapaMassa && (
                        <p aria-live="polite">
                          Etapa atual:{" "}
                          <strong>
                            {NOMES_ETAPAS_MASSA[producao.etapaMassa]}
                          </strong>
                        </p>
                      )}
                      <ConsumosDaOrdem ordemId={producao.id} />
                      <div
                        className={
                          styles.cardFooter
                        }
                      >
                        {producao.status ===
                        "concluida" ? (
                          <div
                            className={
                              styles.completedMessage
                            }
                          >
                            <CheckCircle2
                              size={20}
                              aria-hidden="true"
                            />
                            Produção concluída
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant={
                              planejada
                                ? "primary"
                                : "success"
                            }
                            fullWidth
                            disabled={statusEmAtualizacao !== null}
                            onClick={() =>
                              avancarStatus(
                                producao,
                              )
                            }
                          >
                            {statusEmAtualizacao === producao.id
                              ? "Atualizando..."
                              : rotuloAcao}
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          ) : (
            <div className={styles.empty}>
              <Search
                size={42}
                aria-hidden="true"
              />
              <h3>
                Nenhuma produção
                encontrada
              </h3>
              <p>
                Altere os filtros ou
                pesquise utilizando outro
                nome, código ou
                responsável.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={limparFiltros}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </section>
      </div>
      <NewProductionModal
        open={modalAberto}
        onClose={() =>
          setModalAberto(false)
        }
        onConfirm={
          registrarProducao
        }
      />
      {producaoParaConcluir && (
        <ConclusaoMassaModal
          key={producaoParaConcluir.id}
          open
          producao={producaoParaConcluir}
          processando={
            statusEmAtualizacao === producaoParaConcluir.id
          }
          onClose={() => setProducaoParaConcluir(null)}
          onConfirm={concluirProducaoMassa}
        />
      )}
    </AppLayout>
  );
}
