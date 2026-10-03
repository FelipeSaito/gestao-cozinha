"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Download,
  Filter,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/contexts/InventoryContext";

import type { Product } from "@/types";

import {
  chaveSabor,
  nomeSabor,
} from "@/lib/nomesSabores";

import { formatCurrency } from "@/lib/format";
import { useFeirasCadastradas } from "@/services/useFeirasCadastradas";

import {
  escutarPlanejamentos,
  type Planejamentos,
} from "@/services/planejamentosFirestore";

import {
  escutarSaidas,
  type Saidas,
} from "@/services/saidasFirestore";

import {
  escutarFechamentos,
  type Retornos,
} from "@/services/fechamentosFirestore";

import {
  listarOrdens,
  type OrdemRemota,
} from "@/services/ordensProducao";

import {
  escutarProducaoFeiras,
  type ProducoesFeira,
} from "@/services/producaoFeirasFirestore";

import {
  consultarConsumosPorPeriodo,
  type ConsumoRegistrado,
} from "@/services/consumosEstoque";

import {
  consultarDescartesFeira,
  type DescartesFeira,
} from "@/services/descartesFeira";

import styles from "./page.module.css";

type Linha = {
  chave: string;
  data: string;
  feiraId: string;
  feira: string;
  responsaveis: string;
  planejados: number;
  separados: number | null;
  sobras: number | null;
};

type LinhaSabor = {
  id: string;
  nome: string;
  planejados: number | null;
  separados: number | null;
  sobras: number | null;
};

function normalizar(nome: string) {
  return chaveSabor(nome);
}

function saboresDaFeira(
  chave: string,
  planos: Planejamentos,
  saidas: Saidas,
  retornos: Retornos,
): LinhaSabor[] {
  const mapa =
    new Map<string, LinhaSabor>();

  function obterLinha(
    nome: string,
    id: string,
  ) {
    const identificador =
      normalizar(nome) || id;

    const atual =
      mapa.get(identificador);

    if (atual) {
      return atual;
    }

    const nova: LinhaSabor = {
      id: identificador,
      nome: nomeSabor(nome),
      planejados: null,
      separados: null,
      sobras: null,
    };

    mapa.set(
      identificador,
      nova,
    );

    return nova;
  }

  for (
    const item of planos[chave] ?? []
  ) {
    const atual = obterLinha(
      item.nome,
      item.id,
    );

    atual.planejados =
      (atual.planejados ?? 0) +
      item.quantidade;
  }

  for (
    const item of
      saidas[chave]?.itens ?? []
  ) {
    const atual = obterLinha(
      item.nome,
      item.saborId,
    );

    atual.separados =
      (atual.separados ?? 0) +
      item.separado;
  }

  for (
    const item of
      retornos[chave]?.itens ?? []
  ) {
    const atual = obterLinha(
      item.nome,
      item.saborId,
    );

    atual.sobras =
      (atual.sobras ?? 0) +
      item.sobraram;
  }

  return [...mapa.values()].sort(
    (a, b) =>
      a.nome.localeCompare(
        b.nome,
        "pt-BR",
      ),
  );
}

function hojeBrasil() {
  const partes =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      },
    ).formatToParts(new Date());

  const campo = (tipo: string) =>
    partes.find(
      (parte) =>
        parte.type === tipo,
    )?.value;

  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}

function diasAtras(
  iso: string,
  dias: number,
) {
  const data = new Date(
    `${iso}T12:00:00Z`,
  );

  data.setUTCDate(
    data.getUTCDate() - dias,
  );

  return data
    .toISOString()
    .slice(0, 10);
}

function csvCampo(
  valor: string | number | null,
) {
  const texto =
    valor === null
      ? ""
      : String(valor);

  const seguro =
    /^[\s]*[=+\-@]/.test(texto)
      ? `'${texto}`
      : texto;

  return `"${seguro.replace(
    /"/g,
    '""',
  )}"`;
}

export default function RelatoriosPage() {
  const { usuario } = useAuth();

  const [fim, setFim] =
    useState(hojeBrasil);

  const [inicio, setInicio] =
    useState(() =>
      diasAtras(hojeBrasil(), 29),
    );

  const [feiraId, setFeiraId] =
    useState("");

  const [
    localEstoque,
    setLocalEstoque,
  ] = useState<
    "principal" | "cozinha"
  >("principal");

  const [
    detalheAberto,
    setDetalheAberto,
  ] = useState<string | null>(null);

  const [planos, setPlanos] =
    useState<Planejamentos>({});

  const [saidas, setSaidas] =
    useState<Saidas>({});

  const [retornos, setRetornos] =
    useState<Retornos>({});

  const [ordens, setOrdens] =
    useState<OrdemRemota[]>([]);

  const [producoes, setProducoes] =
    useState<ProducoesFeira>({});

  const [
    carregandoProducao,
    setCarregandoProducao,
  ] = useState(true);

  const [
    erroProducao,
    setErroProducao,
  ] = useState("");

  const [consumos, setConsumos] =
    useState<ConsumoRegistrado[]>(
      [],
    );

  const [descartes, setDescartes] =
    useState<DescartesFeira>({});

  const [
    erroDescartes,
    setErroDescartes,
  ] = useState("");

  const [
    carregandoDescartes,
    setCarregandoDescartes,
  ] = useState(true);

  const [
    carregandoCustos,
    setCarregandoCustos,
  ] = useState(true);

  const [
    erroCustos,
    setErroCustos,
  ] = useState("");

  const [
    carregandoOrdens,
    setCarregandoOrdens,
  ] = useState(true);

  const [
    erroOrdens,
    setErroOrdens,
  ] = useState("");

  const [
    carregados,
    setCarregados,
  ] = useState({
    planos: false,
    saidas: false,
    retornos: false,
  });

  const [erros, setErros] =
    useState({
      planos: "",
      saidas: "",
      retornos: "",
    });

  const {
    feirasCadastradas,
    erroFeirasCadastradas,
  } = useFeirasCadastradas(
    usuario?.id,
  );

  const {
    produtos: estoquePrincipal,
    estoqueCozinha,
    carregando: carregandoEstoque,
    erro: erroEstoque,
  } = useInventory();

  const dono = Boolean(
    usuario?.perfis?.includes(
      "dono",
    ) ||
      usuario?.perfil === "dono",
  );

  useEffect(() => {
    if (!usuario?.id || !dono) {
      return;
    }

    const pararPlanos =
      escutarPlanejamentos(
        (dados) => {
          setPlanos(dados);

          setCarregados(
            (atual) => ({
              ...atual,
              planos: true,
            }),
          );

          setErros((atual) => ({
            ...atual,
            planos: "",
          }));
        },
        (erro) => {
          setErros((atual) => ({
            ...atual,
            planos: erro.message,
          }));

          setCarregados(
            (atual) => ({
              ...atual,
              planos: false,
            }),
          );
        },
      );

    const pararSaidas =
      escutarSaidas(
        (dados) => {
          setSaidas(dados);

          setCarregados(
            (atual) => ({
              ...atual,
              saidas: true,
            }),
          );

          setErros((atual) => ({
            ...atual,
            saidas: "",
          }));
        },
        (erro) => {
          setErros((atual) => ({
            ...atual,
            saidas: erro.message,
          }));

          setCarregados(
            (atual) => ({
              ...atual,
              saidas: false,
            }),
          );
        },
      );

    const pararRetornos =
      escutarFechamentos(
        (dados) => {
          setRetornos(dados);

          setCarregados(
            (atual) => ({
              ...atual,
              retornos: true,
            }),
          );

          setErros((atual) => ({
            ...atual,
            retornos: "",
          }));
        },
        (erro) => {
          setErros((atual) => ({
            ...atual,
            retornos:
              erro.message,
          }));

          setCarregados(
            (atual) => ({
              ...atual,
              retornos: false,
            }),
          );
        },
      );

    return () => {
      pararPlanos();
      pararSaidas();
      pararRetornos();
    };
  }, [usuario?.id, dono]);

  useEffect(() => {
    if (!usuario?.id || !dono) {
      return;
    }

    return escutarProducaoFeiras(
      (dados) => {
        setProducoes(dados);
        setCarregandoProducao(
          false,
        );
        setErroProducao("");
      },
      (falha) => {
        setErroProducao(
          falha.message,
        );
        setCarregandoProducao(
          false,
        );
      },
    );
  }, [usuario?.id, dono]);

  useEffect(() => {
    if (
      !usuario?.id ||
      !dono ||
      !inicio ||
      !fim ||
      inicio > fim
    ) {
      return;
    }

    let ativo = true;

    const temporizador = window.setTimeout(
      () => {
        setCarregandoCustos(true);
        setErroCustos("");

        void consultarConsumosPorPeriodo(
          inicio,
          fim,
        )
          .then((dados) => {
            if (ativo) {
              setConsumos(dados);
            }
          })
          .catch(
            (falha: unknown) => {
              if (ativo) {
                setConsumos([]);

                setErroCustos(
                  falha instanceof Error
                    ? falha.message
                    : "Erro nos custos.",
                );
              }
            },
          )
          .finally(() => {
            if (ativo) {
              setCarregandoCustos(
                false,
              );
            }
          });
      },
      0,
    );

    return () => {
      ativo = false;
      window.clearTimeout(
        temporizador,
      );
    };
  }, [
    usuario?.id,
    dono,
    inicio,
    fim,
  ]);

  useEffect(() => {
    if (!usuario?.id || !dono) {
      return;
    }

    let ativo = true;

    void consultarDescartesFeira()
      .then((dados) => {
        if (ativo) {
          setDescartes(dados);
          setErroDescartes("");
        }
      })
      .catch(
        (falha: unknown) => {
          if (ativo) {
            setErroDescartes(
              falha instanceof Error
                ? falha.message
                : "Erro nos descartes.",
            );
          }
        },
      )
      .finally(() => {
        if (ativo) {
          setCarregandoDescartes(
            false,
          );
        }
      });

    return () => {
      ativo = false;
    };
  }, [usuario?.id, dono]);

  useEffect(() => {
    if (!usuario?.id || !dono) {
      return;
    }

    let ativo = true;

    const temporizador = window.setTimeout(
      () => {
        setCarregandoOrdens(true);

        void listarOrdens()
          .then((dados) => {
            if (ativo) {
              setOrdens(dados);
              setErroOrdens("");
            }
          })
          .catch(
            (falha: unknown) => {
              if (ativo) {
                setErroOrdens(
                  falha instanceof Error
                    ? falha.message
                    : "Não foi possível carregar as ordens de massa.",
                );
              }
            },
          )
          .finally(() => {
            if (ativo) {
              setCarregandoOrdens(
                false,
              );
            }
          });
      },
      0,
    );

    return () => {
      ativo = false;
      window.clearTimeout(
        temporizador,
      );
    };
  }, [usuario?.id, dono]);

  const linhas = useMemo<
    Linha[]
  >(() => {
    const chaves = new Set([
      ...Object.keys(planos),
      ...Object.keys(saidas),
      ...Object.keys(retornos),
    ]);

    return [...chaves]
      .map((chave) => {
        const separador =
          chave.indexOf(":");

        const data = chave.slice(
          0,
          separador,
        );

        const id = chave.slice(
          separador + 1,
        );

        const feira =
          feirasCadastradas.find(
            (item) =>
              item.id === id,
          );

        return {
          chave,
          data,
          feiraId: id,
          feira:
            feira?.nome ?? id,

          responsaveis:
            feira?.responsaveis.join(
              ", ",
            ) ?? "—",

          planejados:
            (
              planos[chave] ?? []
            ).reduce(
              (total, item) =>
                total +
                item.quantidade,
              0,
            ),

          separados: saidas[chave]
            ? saidas[
                chave
              ].itens.reduce(
                (total, item) =>
                  total +
                  item.separado,
                0,
              )
            : null,

          sobras: retornos[chave]
            ? retornos[
                chave
              ].itens.reduce(
                (total, item) =>
                  total +
                  item.sobraram,
                0,
              )
            : null,
        };
      })
      .filter(
        (linha) =>
          linha.data >= inicio &&
          linha.data <= fim &&
          (!feiraId ||
            linha.feiraId ===
              feiraId),
      )
      .sort(
        (a, b) =>
          b.data.localeCompare(
            a.data,
          ) ||
          a.feira.localeCompare(
            b.feira,
            "pt-BR",
          ),
      );
  }, [
    planos,
    saidas,
    retornos,
    feirasCadastradas,
    inicio,
    fim,
    feiraId,
  ]);

  const totais = useMemo(
    () => ({
      planejados: linhas.reduce(
        (soma, linha) =>
          soma +
          linha.planejados,
        0,
      ),

      separados: linhas.reduce(
        (soma, linha) =>
          soma +
          (linha.separados ?? 0),
        0,
      ),

      sobras: linhas.reduce(
        (soma, linha) =>
          soma +
          (linha.sobras ?? 0),
        0,
      ),
    }),
    [linhas],
  );

  const producaoRegistrada =
    linhas.reduce(
      (soma, linha) =>
        soma +
        (
          producoes[
            linha.chave
          ] ?? []
        ).reduce(
          (total, registro) =>
            total +
            registro.quantidade,
          0,
        ),
      0,
    );

  const feirasFechadas =
    linhas.filter(
      (linha) =>
        linha.separados !== null &&
        linha.sobras !== null,
    );

  const sobrasFechadas =
    feirasFechadas.reduce(
      (soma, linha) =>
        soma +
        (linha.sobras ?? 0),
      0,
    );

  const taxaSobras =
    feirasFechadas.reduce(
      (soma, linha) =>
        soma +
        (linha.separados ?? 0),
      0,
    );

  const custoConhecido =
    consumos.filter(
      (item) =>
        typeof item.custoUnitario ===
          "number" &&
        Number.isFinite(
          item.custoUnitario,
        ) &&
        item.custoUnitario >= 0,
    );

  const custoInsumos =
    custoConhecido.reduce(
      (soma, item) =>
        soma +
        item.quantidade *
          (item.custoUnitario ?? 0),
      0,
    );

  const consumosSemCusto =
    consumos.length -
    custoConhecido.length;

  const perdasConfirmadas =
    linhas.reduce(
      (total, linha) =>
        total +
        Object.entries(
          descartes,
        ).reduce(
          (
            soma,
            [origem, quantidade],
          ) =>
            soma +
            (origem.startsWith(
              `${linha.chave}|`,
            )
              ? quantidade
              : 0),
          0,
        ),
      0,
    );

  const ordensMassa = useMemo(
    () =>
      ordens
        .filter(
          (ordem) =>
            normalizar(
              ordem.prato,
            ) ===
              "massa de pastel" &&
            normalizar(
              ordem.unidade,
            ) === "kg" &&
            ordem.dataProducao >=
              inicio &&
            ordem.dataProducao <=
              fim,
        )
        .sort((a, b) =>
          b.dataProducao.localeCompare(
            a.dataProducao,
          ),
        ),
    [ordens, inicio, fim],
  );

  const custosPorOrdem = useMemo(() => {
    const mapa = new Map<
      string,
      {
        custoTotal: number;
        quantidadeRegistros: number;
        registrosSemCusto: number;
      }
    >();

    for (const consumo of consumos) {
      if (!consumo.ordemId) {
        continue;
      }

      const atual = mapa.get(
        consumo.ordemId,
      ) ?? {
        custoTotal: 0,
        quantidadeRegistros: 0,
        registrosSemCusto: 0,
      };

      atual.quantidadeRegistros += 1;

      if (
        typeof consumo.custoUnitario ===
          "number" &&
        Number.isFinite(
          consumo.custoUnitario,
        ) &&
        consumo.custoUnitario >= 0
      ) {
        atual.custoTotal +=
          consumo.quantidade *
          consumo.custoUnitario;
      } else {
        atual.registrosSemCusto += 1;
      }

      mapa.set(consumo.ordemId, atual);
    }

    return mapa;
  }, [consumos]);

  function calcularCustosMassa(
    ordem: OrdemRemota,
  ) {
    const custo =
      custosPorOrdem.get(ordem.id);

    const resultado =
      ordem.resultadoMassa;

    const custoTotal =
      custo &&
      custo.quantidadeRegistros > 0 &&
      custo.registrosSemCusto === 0
        ? custo.custoTotal
        : null;

    function custoUnitario(
      quantidade:
        | number
        | undefined,
    ) {
      if (
        custoTotal === null ||
        !quantidade ||
        quantidade <= 0
      ) {
        return null;
      }

      return (
        Math.round(
          (custoTotal / quantidade) *
            10000,
        ) / 10000
      );
    }

    return {
      custoTotal,
      custoPorBloco: custoUnitario(
        resultado?.quantidadeBlocos,
      ),
      custoPorSaco: custoUnitario(
        resultado?.quantidadeSacos,
      ),
      custoPorRolo: custoUnitario(
        resultado?.quantidadeRolos,
      ),
    };
  }

  const kgPlanejados =
    ordensMassa.reduce(
      (soma, ordem) =>
        soma + ordem.quantidade,
      0,
    );

  const ordensMassaConcluidas =
    ordensMassa.filter(
      (ordem) =>
        ordem.status ===
        "concluida",
    );

  const totalBlocos =
    ordensMassaConcluidas.reduce(
      (soma, ordem) =>
        soma +
        (ordem.resultadoMassa
          ?.quantidadeBlocos ?? 0),
      0,
    );

  const pesoEstimadoTotal =
    ordensMassaConcluidas.reduce(
      (soma, ordem) =>
        soma +
        (ordem.resultadoMassa
          ?.pesoEstimadoKg ?? 0),
      0,
    );

  const totalSacosMassa =
    ordensMassaConcluidas.reduce(
      (soma, ordem) =>
        soma +
        (ordem.resultadoMassa
          ?.quantidadeSacos ?? 0),
      0,
    );

  const totalRolosMassa =
    ordensMassaConcluidas.reduce(
      (soma, ordem) =>
        soma +
        (ordem.resultadoMassa
          ?.quantidadeRolos ?? 0),
      0,
    );

  const itensEstoque: Product[] =
    localEstoque === "principal"
      ? estoquePrincipal
      : estoqueCozinha;

  const itensOrdenados = [
    ...itensEstoque,
  ].sort(
    (a, b) =>
      a.nome.localeCompare(
        b.nome,
        "pt-BR",
      ) ||
      a.lote.localeCompare(
        b.lote,
        "pt-BR",
      ),
  );

  const lotesVencidos =
    itensEstoque.filter(
      (item) =>
        item.situacao === "vencido",
    ).length;

  const lotesBaixos =
    itensEstoque.filter(
      (item) =>
        item.situacao ===
        "estoque-baixo",
    ).length;

  const carregando =
    !carregados.planos ||
    !carregados.saidas ||
    !carregados.retornos;

  const erro = [
    erros.planos,
    erros.saidas,
    erros.retornos,
    erroFeirasCadastradas,
  ]
    .filter(Boolean)
    .join(" ");

  const periodoInvalido =
    !inicio ||
    !fim ||
    inicio > fim;

  const podeMostrar =
    dono &&
    !carregando &&
    !erro &&
    !periodoInvalido;

  function baixarCsv(
    nomeArquivo: string,
    cabecalho: Array<
      string | number | null
    >,
    valores: Array<
      Array<
        string | number | null
      >
    >,
  ) {
    const csv =
      "\uFEFF" +
      [cabecalho, ...valores]
        .map((campos) =>
          campos
            .map(csvCampo)
            .join(";"),
        )
        .join("\r\n");

    const url =
      URL.createObjectURL(
        new Blob([csv], {
          type: "text/csv;charset=utf-8",
        }),
      );

    const link =
      document.createElement("a");

    link.href = url;
    link.download = nomeArquivo;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(
      () =>
        URL.revokeObjectURL(url),
      1000,
    );
  }

  function exportar() {
    if (
      !podeMostrar ||
      !linhas.length
    ) {
      return;
    }

    baixarCsv(
      `feiras-${inicio}-a-${fim}.csv`,
      [
        "Data",
        "Feira",
        "Responsáveis",
        "Planejados",
        "Separados",
        "Sobras",
      ],
      linhas.map((linha) => [
        linha.data,
        linha.feira,
        linha.responsaveis,
        linha.planejados,
        linha.separados,
        linha.sobras,
      ]),
    );
  }

  function exportarSabores() {
    if (
      !podeMostrar ||
      !linhas.length
    ) {
      return;
    }

    baixarCsv(
      `sabores-feiras-${inicio}-a-${fim}.csv`,
      [
        "Data",
        "Feira",
        "Responsáveis",
        "Sabor",
        "Planejados",
        "Separados",
        "Sobras",
      ],
      linhas.flatMap((feira) =>
        saboresDaFeira(
          feira.chave,
          planos,
          saidas,
          retornos,
        ).map((sabor) => [
          feira.data,
          feira.feira,
          feira.responsaveis,
          sabor.nome,
          sabor.planejados,
          sabor.separados,
          sabor.sobras,
        ]),
      ),
    );
  }

  function exportarMassa() {
    if (
      !dono ||
      carregandoOrdens ||
      erroOrdens ||
      periodoInvalido ||
      !ordensMassa.length
    ) {
      return;
    }

    const valores =
      ordensMassa.map((ordem) => {
        const custos =
          calcularCustosMassa(ordem);

        return [
          ordem.dataProducao,
          ordem.codigo,
          ordem.responsavel,
          ordem.quantidade,
          ordem.status,
          ordem.resultadoMassa
            ?.quantidadeBlocos ?? "",
          ordem.resultadoMassa
            ?.pesoEstimadoKg ?? "",
          ordem.resultadoMassa
            ?.quantidadeSacos ?? "",
          ordem.resultadoMassa
            ?.quantidadeRolos ?? "",
          custos.custoTotal ?? "",
          custos.custoPorBloco ?? "",
          custos.custoPorSaco ?? "",
          custos.custoPorRolo ?? "",
        ];
      });

    baixarCsv(
      `massa-${inicio}-a-${fim}.csv`,
      [
        "Data",
        "Código",
        "Responsável",
        "Kg planejados",
        "Situação",
        "Blocos produzidos",
        "Peso estimado kg",
        "Sacos armazenados",
        "Rolos armazenados",
        "Custo total",
        "Custo por bloco",
        "Custo por saco",
        "Custo por rolo",
      ],
      valores,
    );
  }

  function exportarEstoque() {
    if (
      !dono ||
      carregandoEstoque ||
      erroEstoque ||
      !itensOrdenados.length
    ) {
      return;
    }

    baixarCsv(
      `estoque-${localEstoque}-${hojeBrasil()}.csv`,
      [
        "Local",
        "Ingrediente",
        "Lote",
        "Validade",
        "Quantidade",
        "Unidade",
        "Situação",
      ],
      itensOrdenados.map(
        (item) => [
          localEstoque ===
          "principal"
            ? "Principal"
            : "Cozinha",

          item.nome,
          item.lote,
          item.validade,
          item.quantidade,
          item.unidade,
          item.situacao,
        ],
      ),
    );
  }

  return (
    <AppLayout
      title="Relatórios"
      subtitle="Acompanhe os registros reais das feiras."
      headerActions={
        dono ? (
          <Button
            type="button"
            variant="secondary"
            leftIcon={
              <Download size={18} />
            }
            disabled={
              !podeMostrar ||
              linhas.length === 0
            }
            onClick={exportar}
          >
            Exportar CSV
          </Button>
        ) : undefined
      }
    >
      <div className={styles.page}>
        {!dono ? (
          <p role="alert">
            Somente o Dono pode
            consultar este relatório.
          </p>
        ) : (
          <>
            <section
              className={styles.panel}
              aria-labelledby="filtros-feiras"
            >
              <div
                className={
                  styles.heading
                }
              >
                <div>
                  <h2 id="filtros-feiras">
                    Relatório de feiras
                  </h2>

                  <p>
                    Planejamento, saída
                    conferida e sobras
                    registradas por
                    feira.
                  </p>
                </div>

                <Filter
                  size={22}
                  aria-hidden="true"
                />
              </div>

              <div
                className={
                  styles.filters
                }
              >
                <label>
                  De

                  <input
                    type="date"
                    value={inicio}
                    onChange={(
                      evento,
                    ) =>
                      setInicio(
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  Até

                  <input
                    type="date"
                    value={fim}
                    onChange={(
                      evento,
                    ) =>
                      setFim(
                        evento.target
                          .value,
                      )
                    }
                  />
                </label>

                <label>
                  Feira

                  <select
                    value={feiraId}
                    onChange={(
                      evento,
                    ) =>
                      setFeiraId(
                        evento.target
                          .value,
                      )
                    }
                  >
                    <option value="">
                      Todas as feiras
                    </option>

                    {feirasCadastradas.map(
                      (feira) => (
                        <option
                          value={
                            feira.id
                          }
                          key={feira.id}
                        >
                          {feira.nome}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              {periodoInvalido && (
                <p
                  role="alert"
                  className={
                    styles.error
                  }
                >
                  Escolha um período
                  válido.
                </p>
              )}
            </section>

            {erro && (
              <p
                role="alert"
                className={styles.error}
              >
                {erro}
              </p>
            )}

            {!erro && carregando && (
              <p role="status">
                Carregando dados do
                Firestore...
              </p>
            )}

            {podeMostrar && (
              <>
                <section
                  className={
                    styles.metrics
                  }
                  aria-label="Totais do período"
                >
                  <div>
                    <span>
                      Feiras com
                      registros
                    </span>

                    <strong>
                      {linhas.length}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Pastéis planejados
                    </span>

                    <strong>
                      {
                        totais.planejados
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Saídas conferidas
                    </span>

                    <strong>
                      {
                        totais.separados
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Sobras registradas
                    </span>

                    <strong>
                      {totais.sobras}
                    </strong>
                  </div>
                </section>

                <section
                  className={
                    styles.panel
                  }
                  aria-labelledby="indicadores-producao"
                >
                  <div
                    className={
                      styles.heading
                    }
                  >
                    <div>
                      <h2 id="indicadores-producao">
                        Produção, sobras
                        e custos
                      </h2>

                      <p>
                        Indicadores
                        calculados com os
                        registros do
                        período
                        selecionado.
                      </p>
                    </div>
                  </div>

                  {erroProducao ? (
                    <p
                      role="alert"
                      className={
                        styles.error
                      }
                    >
                      {erroProducao}
                    </p>
                  ) : carregandoProducao ? (
                    <p role="status">
                      Carregando
                      produção...
                    </p>
                  ) : (
                    <div
                      className={
                        styles.metrics
                      }
                    >
                      <div>
                        <span>
                          Pastéis
                          previstos
                        </span>

                        <strong>
                          {
                            totais.planejados
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Produção
                          registrada
                        </span>

                        <strong>
                          {
                            producaoRegistrada
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Diferença para
                          o previsto
                        </span>

                        <strong
                          className={
                            producaoRegistrada -
                              totais.planejados <
                            0
                              ? styles.negative
                              : undefined
                          }
                        >
                          {producaoRegistrada -
                            totais.planejados >
                          0
                            ? "+"
                            : ""}

                          {producaoRegistrada -
                            totais.planejados}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Feiras com
                          fechamento
                        </span>

                        <strong>
                          {
                            feirasFechadas.length
                          }
                        </strong>
                      </div>
                    </div>
                  )}

                  <div
                    className={
                      styles.metrics
                    }
                  >
                    <div>
                      <span>
                        Sobras nas feiras
                        fechadas
                      </span>

                      <strong>
                        {sobrasFechadas}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Taxa de sobras
                        sobre saídas
                        fechadas
                      </span>

                      <strong>
                        {taxaSobras > 0
                          ? `${(
                              (100 *
                                sobrasFechadas) /
                              taxaSobras
                            ).toFixed(1)}%`
                          : "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Pastéis
                        descartados
                      </span>

                      <strong>
                        {erroDescartes ||
                        carregandoDescartes
                          ? "—"
                          : perdasConfirmadas}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Custo de insumos
                        consumidos
                      </span>

                      <strong>
                        {erroCustos ||
                        carregandoCustos ||
                        !consumos.length ||
                        consumosSemCusto
                          ? "—"
                          : formatCurrency(
                              custoInsumos,
                            )}
                      </strong>
                    </div>
                  </div>

                  {erroCustos ? (
                    <p
                      role="alert"
                      className={
                        styles.error
                      }
                    >
                      {erroCustos}
                    </p>
                  ) : carregandoCustos ? (
                    <p role="status">
                      Carregando
                      custos...
                    </p>
                  ) : (
                    <p
                      className={
                        styles.note
                      }
                    >
                      Consumos no período:{" "}
                      {consumos.length}. Com
                      custo registrado:{" "}
                      {
                        custoConhecido.length
                      }.

                      {consumosSemCusto >
                        0 &&
                        ` ${consumosSemCusto} consumo(s) antigo(s) não têm custo histórico; o total fica indisponível.`}

                      {consumos.length ===
                        0 &&
                        " Sem consumo registrado, não há custo de produção calculável."}
                    </p>
                  )}

                  {erroDescartes && (
                    <p
                      role="alert"
                      className={
                        styles.error
                      }
                    >
                      {erroDescartes}
                    </p>
                  )}

                  <p
                    className={
                      styles.note
                    }
                  >
                    O descarte soma apenas
                    pastéis efetivamente
                    registrados como
                    perda. Sobras podem
                    ser reaproveitadas. O
                    custo mostrado
                    considera apenas
                    insumos consumidos,
                    sem mão de obra e
                    outras despesas; não
                    é custo por feira.
                  </p>
                </section>

                <section
                  className={
                    styles.panel
                  }
                  aria-labelledby="registros-feiras"
                >
                  <div
                    className={
                      styles.heading
                    }
                  >
                    <h2 id="registros-feiras">
                      Feiras no período
                    </h2>

                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        !linhas.length
                      }
                      onClick={
                        exportarSabores
                      }
                    >
                      Exportar sabores CSV
                    </Button>
                  </div>

                  {linhas.length === 0 ? (
                    <p>
                      Nenhum registro
                      encontrado para
                      este período.
                    </p>
                  ) : (
                    <div
                      className={
                        styles.tableScroll
                      }
                      role="region"
                      aria-label="Registros de feiras"
                      tabIndex={0}
                    >
                      <table
                        className={
                          styles.table
                        }
                      >
                        <thead>
                          <tr>
                            <th scope="col">
                              Data
                            </th>

                            <th scope="col">
                              Feira
                            </th>

                            <th scope="col">
                              Responsáveis
                            </th>

                            <th scope="col">
                              Planejados
                            </th>

                            <th scope="col">
                              Separados
                            </th>

                            <th scope="col">
                              Sobras
                            </th>

                            <th scope="col">
                              Detalhes
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {linhas.map(
                            (linha) => {
                              const aberta =
                                detalheAberto ===
                                linha.chave;

                              const sabores =
                                saboresDaFeira(
                                  linha.chave,
                                  planos,
                                  saidas,
                                  retornos,
                                );

                              return (
                                <Fragment
                                  key={
                                    linha.chave
                                  }
                                >
                                  <tr>
                                    <td>
                                      {linha.data
                                        .split(
                                          "-",
                                        )
                                        .reverse()
                                        .join(
                                          "/",
                                        )}
                                    </td>

                                    <th scope="row">
                                      {
                                        linha.feira
                                      }
                                    </th>

                                    <td>
                                      {
                                        linha.responsaveis
                                      }
                                    </td>

                                    <td>
                                      {
                                        linha.planejados
                                      }
                                    </td>

                                    <td>
                                      {linha.separados ??
                                        "—"}
                                    </td>

                                    <td>
                                      {linha.sobras ??
                                        "—"}
                                    </td>

                                    <td>
                                      <button
                                        type="button"
                                        className={
                                          styles.detailButton
                                        }
                                        aria-expanded={
                                          aberta
                                        }
                                        aria-controls={`sabores-${linha.chave}`}
                                        onClick={() =>
                                          setDetalheAberto(
                                            aberta
                                              ? null
                                              : linha.chave,
                                          )
                                        }
                                      >
                                        {aberta
                                          ? "Ocultar"
                                          : "Ver sabores"}
                                      </button>
                                    </td>
                                  </tr>

                                  {aberta && (
                                    <tr>
                                      <td
                                        colSpan={
                                          7
                                        }
                                        id={`sabores-${linha.chave}`}
                                      >
                                        <div
                                          className={
                                            styles.detail
                                          }
                                        >
                                          <strong>
                                            Sabores
                                            de{" "}
                                            {
                                              linha.feira
                                            }
                                          </strong>

                                          {sabores.length ===
                                          0 ? (
                                            <p>
                                              Nenhum
                                              sabor
                                              registrado.
                                            </p>
                                          ) : (
                                            <ul>
                                              {sabores.map(
                                                (
                                                  sabor,
                                                ) => (
                                                  <li
                                                    key={
                                                      sabor.id
                                                    }
                                                  >
                                                    <span>
                                                      {
                                                        sabor.nome
                                                      }
                                                    </span>

                                                    <span>
                                                      Previstos:{" "}
                                                      {sabor.planejados ??
                                                        "—"}
                                                    </span>

                                                    <span>
                                                      Separados:{" "}
                                                      {sabor.separados ??
                                                        "—"}
                                                    </span>

                                                    <span>
                                                      Sobras:{" "}
                                                      {sabor.sobras ??
                                                        "—"}
                                                    </span>
                                                  </li>
                                                ),
                                              )}
                                            </ul>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <p
                    className={
                      styles.note
                    }
                  >
                    “—” indica que não há
                    conferência ou
                    fechamento salvo. Os
                    totais de saída e
                    sobras somam apenas
                    registros existentes.
                  </p>
                </section>
              </>
            )}

            {!periodoInvalido && (
              <section
                className={
                  styles.panel
                }
                aria-labelledby="relatorio-massa"
              >
                <div
                  className={
                    styles.heading
                  }
                >
                  <div>
                    <h2 id="relatorio-massa">
                      Produção de massa
                    </h2>

                    <p>
                      Rendimento das ordens
                      de massa no período
                      selecionado.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      carregandoOrdens ||
                      Boolean(
                        erroOrdens,
                      ) ||
                      !ordensMassa.length
                    }
                    onClick={
                      exportarMassa
                    }
                  >
                    Exportar massa CSV
                  </Button>
                </div>

                {erroOrdens && (
                  <p
                    role="alert"
                    className={
                      styles.error
                    }
                  >
                    {erroOrdens}
                  </p>
                )}

                {!erroOrdens &&
                  carregandoOrdens && (
                    <p role="status">
                      Carregando ordens de
                      massa...
                    </p>
                  )}

                {!erroOrdens &&
                  !carregandoOrdens && (
                    <>
                      <div
                        className={
                          styles.massSummary
                        }
                      >
                        <div>
                          <span>
                            Ordens
                          </span>

                          <strong>
                            {
                              ordensMassa.length
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Kg planejados
                          </span>

                          <strong>
                            {kgPlanejados.toLocaleString(
                              "pt-BR",
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Ordens
                            concluídas
                          </span>

                          <strong>
                            {
                              ordensMassaConcluidas.length
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Blocos
                            produzidos
                          </span>

                          <strong>
                            {totalBlocos.toLocaleString(
                              "pt-BR",
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Peso estimado
                          </span>

                          <strong>
                            {pesoEstimadoTotal.toLocaleString(
                              "pt-BR",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 3,
                              },
                            )}{" "}
                            kg
                          </strong>
                        </div>

                        <div>
                          <span>
                            Sacos
                            armazenados
                          </span>

                          <strong>
                            {totalSacosMassa.toLocaleString(
                              "pt-BR",
                            )}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Rolos
                            armazenados
                          </span>

                          <strong>
                            {totalRolosMassa.toLocaleString(
                              "pt-BR",
                            )}
                          </strong>
                        </div>
                      </div>

                      {ordensMassa.length ===
                      0 ? (
                        <p>
                          Nenhuma ordem de
                          massa neste
                          período.
                        </p>
                      ) : (
                        <div
                          className={
                            styles.tableScroll
                          }
                          role="region"
                          aria-label="Ordens de massa"
                          tabIndex={0}
                        >
                          <table
                            className={
                              styles.table
                            }
                          >
                            <thead>
                              <tr>
                                <th scope="col">
                                  Data
                                </th>

                                <th scope="col">
                                  Código
                                </th>

                                <th scope="col">
                                  Responsável
                                </th>

                                <th scope="col">
                                  Situação
                                </th>

                                <th scope="col">
                                  Planejado
                                </th>

                                <th scope="col">
                                  Blocos
                                </th>

                                <th scope="col">
                                  Peso
                                  estimado
                                </th>

                                <th scope="col">
                                  Sacos
                                </th>

                                <th scope="col">
                                  Rolos
                                </th>

                                <th scope="col">
                                  Custo total
                                </th>

                                <th scope="col">
                                  Por bloco
                                </th>

                                <th scope="col">
                                  Por saco
                                </th>

                                <th scope="col">
                                  Por rolo
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {ordensMassa.map(
                                (ordem) => {
                                  const resultado =
                                    ordem.resultadoMassa;

                                  const custos =
                                    calcularCustosMassa(
                                      ordem,
                                    );

                                  return (
                                    <tr
                                      key={
                                        ordem.id
                                      }
                                    >
                                      <td>
                                        {ordem.dataProducao
                                          .split(
                                            "-",
                                          )
                                          .reverse()
                                          .join(
                                            "/",
                                          )}
                                      </td>

                                      <th scope="row">
                                        {
                                          ordem.codigo
                                        }
                                      </th>

                                      <td>
                                        {
                                          ordem.responsavel
                                        }
                                      </td>

                                      <td>
                                        {ordem.status ===
                                        "concluida"
                                          ? "Concluída"
                                          : ordem.status ===
                                              "em-andamento"
                                            ? "Em andamento"
                                            : "Planejada"}
                                      </td>

                                      <td>
                                        {ordem.quantidade.toLocaleString(
                                          "pt-BR",
                                        )}{" "}
                                        kg
                                      </td>

                                      <td>
                                        {resultado
                                          ? resultado.quantidadeBlocos.toLocaleString(
                                              "pt-BR",
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {resultado
                                          ? `${resultado.pesoEstimadoKg.toLocaleString(
                                              "pt-BR",
                                              {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 3,
                                              },
                                            )} kg`
                                          : "—"}
                                      </td>

                                      <td>
                                        {resultado
                                          ? resultado.quantidadeSacos.toLocaleString(
                                              "pt-BR",
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {resultado
                                          ? resultado.quantidadeRolos.toLocaleString(
                                              "pt-BR",
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {custos.custoTotal !==
                                        null
                                          ? formatCurrency(
                                              custos.custoTotal,
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {custos.custoPorBloco !==
                                        null
                                          ? formatCurrency(
                                              custos.custoPorBloco,
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {custos.custoPorSaco !==
                                        null
                                          ? formatCurrency(
                                              custos.custoPorSaco,
                                            )
                                          : "—"}
                                      </td>

                                      <td>
                                        {custos.custoPorRolo !==
                                        null
                                          ? formatCurrency(
                                              custos.custoPorRolo,
                                            )
                                          : "—"}
                                      </td>
                                    </tr>
                                  );
                                },
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <p
                        className={
                          styles.note
                        }
                      >
                        O peso é uma
                        estimativa baseada
                        em 1,53 kg por
                        bloco. Os rolos
                        são calculados
                        separadamente,
                        considerando três
                        rolos por saco. Os
                        custos consideram
                        somente os insumos
                        registrados na
                        ordem; “—” indica
                        ausência de consumo
                        ou custo incompleto.
                      </p>
                    </>
                  )}
              </section>
            )}

            <section
              className={styles.panel}
              aria-labelledby="relatorio-estoque"
            >
              <div
                className={
                  styles.heading
                }
              >
                <div>
                  <h2 id="relatorio-estoque">
                    Estoque atual
                  </h2>

                  <p>
                    Saldo atual por
                    ingrediente e lote.
                    Este painel não usa o
                    filtro de período
                    acima.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    carregandoEstoque ||
                    Boolean(erroEstoque) ||
                    !itensOrdenados.length
                  }
                  onClick={
                    exportarEstoque
                  }
                >
                  Exportar estoque CSV
                </Button>
              </div>

              <label
                className={
                  styles.stockSelector
                }
              >
                Local do estoque

                <select
                  value={localEstoque}
                  onChange={(evento) =>
                    setLocalEstoque(
                      evento.target
                        .value as
                        | "principal"
                        | "cozinha",
                    )
                  }
                >
                  <option value="principal">
                    Estoque principal
                  </option>

                  <option value="cozinha">
                    Estoque da cozinha
                  </option>
                </select>
              </label>

              {erroEstoque && (
                <p
                  role="alert"
                  className={
                    styles.error
                  }
                >
                  {erroEstoque}
                </p>
              )}

              {!erroEstoque &&
                carregandoEstoque && (
                  <p role="status">
                    Carregando estoque...
                  </p>
                )}

              {!erroEstoque &&
                !carregandoEstoque && (
                  <>
                    <div
                      className={
                        styles.massSummary
                      }
                    >
                      <div>
                        <span>
                          Lotes cadastrados
                        </span>

                        <strong>
                          {
                            itensEstoque.length
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Estoque baixo
                        </span>

                        <strong>
                          {lotesBaixos}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Lotes vencidos
                        </span>

                        <strong>
                          {lotesVencidos}
                        </strong>
                      </div>
                    </div>

                    {itensOrdenados.length ===
                    0 ? (
                      <p>
                        Nenhum ingrediente
                        neste estoque.
                      </p>
                    ) : (
                      <div
                        className={
                          styles.tableScroll
                        }
                        role="region"
                        aria-label="Ingredientes do estoque"
                        tabIndex={0}
                      >
                        <table
                          className={
                            styles.table
                          }
                        >
                          <thead>
                            <tr>
                              <th scope="col">
                                Ingrediente
                              </th>

                              <th scope="col">
                                Lote
                              </th>

                              <th scope="col">
                                Validade
                              </th>

                              <th scope="col">
                                Situação
                              </th>

                              <th scope="col">
                                Quantidade
                              </th>
                            </tr>
                          </thead>

                          <tbody>
                            {itensOrdenados.map(
                              (item) => (
                                <tr
                                  key={
                                    item.id
                                  }
                                >
                                  <th scope="row">
                                    {
                                      item.nome
                                    }
                                  </th>

                                  <td>
                                    {
                                      item.lote
                                    }
                                  </td>

                                  <td>
                                    {item.validade
                                      .split(
                                        "-",
                                      )
                                      .reverse()
                                      .join(
                                        "/",
                                      )}
                                  </td>

                                  <td>
                                    {item.situacao.replaceAll(
                                      "-",
                                      " ",
                                    )}
                                  </td>

                                  <td>
                                    {
                                      item.quantidade
                                    }{" "}
                                    {
                                      item.unidade
                                    }
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <p
                      className={
                        styles.note
                      }
                    >
                      As quantidades têm
                      unidades diferentes;
                      por isso não há soma
                      geral de kg, litros e
                      unidades.
                    </p>
                  </>
                )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
