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
  BarChart3,
  CalendarDays,
  ClipboardList,
  ChefHat,
  PackageCheck,
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

import { consultarComplementoRelatorio } from "@/services/relatorios";
import { campoCsv, type CustoOrdemRelatorio, type DescarteRelatorio } from "@/lib/relatorios";

import {
  agruparFaturamento,
  calcularItensVendidos,
  precoVendaCentavos,
  tipoLocalFaturamento,
  type TipoLocalFaturamento,
  formatarFaturamento,
} from "@/lib/faturamento-feira";

import styles from "./page.module.css";

type Linha = {
  chave: string;
  data: string;
  feiraId: string;
  feira: string;
  tipo: TipoLocalFaturamento;
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

const csvCampo = campoCsv;

type SerieGrafico = { chave: string; nome: string; cor: string };
type PontoGrafico = { id: string; nome: string; valores: Record<string, number | null> };
const SERIES_OPERACAO: SerieGrafico[] = [
  { chave: "planejados", nome: "Planejados", cor: "#244567" },
  { chave: "produzidos", nome: "Produzidos", cor: "#16806a" },
  { chave: "separados", nome: "Separados", cor: "#798bd3" },
];
const SERIES_FEIRAS: SerieGrafico[] = [
  { chave: "separados", nome: "Separados", cor: "#244567" },
  { chave: "sobras", nome: "Sobras", cor: "#c48122" },
];
const numeroGrafico = (valor: number) => valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dataCurta = (iso: string) => iso.slice(5).split("-").reverse().join("/");

function agruparOperacao(
  linhas: Linha[], planos: Planejamentos, saidas: Saidas, retornos: Retornos,
  producoes: ProducoesFeira, inicio: string, fim: string,
) {
  const dias = Math.floor((Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1;
  const agrupamento = dias <= 16 ? "dia" : dias <= 112 ? "semana" : "mês";
  const periodos = new Map<string, PontoGrafico>();
  const feiras = new Map<string, PontoGrafico>();
  const sabores = new Map<string, PontoGrafico>();
  function somar(ponto: PontoGrafico, chave: string, valor: number | null) {
    if (valor !== null) ponto.valores[chave] = (ponto.valores[chave] ?? 0) + valor;
  }
  for (const linha of linhas) {
    let chave = linha.data;
    if (agrupamento === "semana") {
      const distancia = Math.floor((Date.parse(`${linha.data}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000);
      const data = new Date(`${inicio}T12:00:00Z`);
      data.setUTCDate(data.getUTCDate() + Math.floor(distancia / 7) * 7);
      chave = data.toISOString().slice(0, 10);
    } else if (agrupamento === "mês") chave = linha.data.slice(0, 7);
    const nome = agrupamento === "mês" ? `${chave.slice(5)}/${chave.slice(2, 4)}` : dataCurta(chave);
    const periodo = periodos.get(chave) ?? { id: chave, nome, valores: { planejados: 0, produzidos: 0, separados: null } };
    const feira = feiras.get(linha.feiraId) ?? { id: linha.feiraId, nome: linha.feira, valores: { separados: null, sobras: null } };
    somar(periodo, "planejados", linha.planejados);
    somar(periodo, "produzidos", (producoes[linha.chave] ?? []).reduce((total, item) => total + item.quantidade, 0));
    somar(periodo, "separados", linha.separados);
    somar(feira, "separados", linha.separados);
    somar(feira, "sobras", linha.sobras);
    periodos.set(chave, periodo);
    feiras.set(linha.feiraId, feira);
    for (const sabor of saboresDaFeira(linha.chave, planos, saidas, retornos)) {
      const ponto = sabores.get(sabor.id) ?? { id: sabor.id, nome: sabor.nome, valores: { separados: null, sobras: null } };
      somar(ponto, "separados", sabor.separados);
      somar(ponto, "sobras", sabor.sobras);
      sabores.set(sabor.id, ponto);
    }
  }
  return {
    agrupamento,
    periodos: [...periodos.values()].sort((a, b) => a.id.localeCompare(b.id)),
    feiras: [...feiras.values()].sort((a, b) => (b.valores.separados ?? 0) - (a.valores.separados ?? 0)),
    sabores: [...sabores.values()].sort((a, b) => (b.valores.sobras ?? 0) - (a.valores.sobras ?? 0) || (b.valores.separados ?? 0) - (a.valores.separados ?? 0)),
  };
}

function LegendaGrafico({ series }: { series: SerieGrafico[] }) {
  return <ul className={styles.legend}>{series.map(serie => <li key={serie.chave}>
    <span style={{ background: serie.cor }} aria-hidden="true" />{serie.nome}
  </li>)}</ul>;
}

function DadosDoGrafico({ dados, series, moeda = false }: { dados: PontoGrafico[]; series: SerieGrafico[]; moeda?: boolean }) {
  return <details className={styles.chartData}>
    <summary>Consultar valores do gráfico</summary>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Valores do gráfico">
      <table className={styles.chartTable}>
        <thead><tr><th scope="col">Referência</th>{series.map(serie => <th scope="col" key={serie.chave}>{serie.nome}</th>)}</tr></thead>
        <tbody>{dados.map(dado => <tr key={dado.id}><th scope="row">{dado.nome}</th>{series.map(serie => {
          const valor = dado.valores[serie.chave];
          return <td key={serie.chave}>{valor == null ? "Não registrado" : moeda ? formatCurrency(valor) : numeroGrafico(valor)}</td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  </details>;
}

function GraficoColunas({ dados, series, titulo }: { dados: PontoGrafico[]; series: SerieGrafico[]; titulo: string }) {
  const maximo = Math.max(1, ...dados.flatMap(dado => series.map(serie => dado.valores[serie.chave] ?? 0)));
  const largura = 700, altura = 270, esquerda = 50, topo = 18, base = 224;
  const passo = (largura - esquerda - 18) / Math.max(1, dados.length);
  const barra = Math.min(18, passo * 0.72 / Math.max(1, series.length));
  return <>
    <LegendaGrafico series={series} />
    {!dados.length ? <div className={styles.emptyChart}>Nenhum registro de feira no período selecionado.</div> : <>
      <svg className={styles.chartSvg} viewBox={`0 0 ${largura} ${altura}`} role="img" aria-label={titulo}>
        {[0, 0.25, 0.5, 0.75, 1].map(fracao => {
          const y = base - fracao * (base - topo);
          return <g key={fracao}><line x1={esquerda} x2={largura - 18} y1={y} y2={y} className={styles.gridLine} />
            <text x={esquerda - 9} y={y + 4} textAnchor="end" className={styles.axisText}>{numeroGrafico(maximo * fracao)}</text></g>;
        })}
        {dados.map((dado, indice) => {
          const centro = esquerda + passo * (indice + 0.5);
          return <g key={dado.id}>
            {series.map((serie, i) => {
              const valor = dado.valores[serie.chave];
              if (valor == null) return null;
              const h = (valor / maximo) * (base - topo);
              return <rect key={serie.chave} x={centro - series.length * barra / 2 + i * barra} y={base - h} width={Math.max(1, barra - 2)} height={h}
                rx={3} fill={serie.cor} tabIndex={0} aria-label={`${dado.nome}, ${serie.nome}: ${numeroGrafico(valor)}`}>
                <title>{`${dado.nome} · ${serie.nome}: ${numeroGrafico(valor)}`}</title>
              </rect>;
            })}
            {(indice % Math.max(1, Math.ceil(dados.length / 7)) === 0 || indice === dados.length - 1) &&
              <text x={centro} y={248} textAnchor="middle" className={styles.axisText}>{dado.nome}</text>}
          </g>;
        })}
      </svg>
      <DadosDoGrafico dados={dados} series={series} />
    </>}
  </>;
}

function GraficoBarras({ dados, series, onSelecionar, selecionado, vazio, moeda = false }: {
  dados: PontoGrafico[]; series: SerieGrafico[]; onSelecionar?: (id: string) => void; selecionado?: string; vazio: string; moeda?: boolean;
}) {
  const maximo = Math.max(1, ...dados.flatMap(dado => series.map(serie => dado.valores[serie.chave] ?? 0)));
  return <>
    <LegendaGrafico series={series} />
    {!dados.length ? <div className={styles.emptyChart}>{vazio}</div> : <div className={styles.horizontalChart}>
      {dados.map(dado => <div key={dado.id} className={styles.barRow}>
        {onSelecionar ? <button className={styles.fairButton} type="button" aria-pressed={selecionado === dado.id}
          onClick={() => onSelecionar(dado.id)}>{dado.nome}<span aria-hidden="true">↗</span></button> : <strong>{dado.nome}</strong>}
        {series.map(serie => {
          const valor = dado.valores[serie.chave];
          return <div className={styles.barLine} key={serie.chave} style={moeda ? { gridTemplateColumns: "minmax(0, 1fr) auto" } : undefined}>
            <div className={styles.barTrack} aria-hidden="true"><div style={{ width: `${100 * (valor ?? 0) / maximo}%`, background: serie.cor }} /></div>
            <span aria-label={`${serie.nome}: ${valor == null ? "não registrado" : moeda ? formatCurrency(valor) : numeroGrafico(valor)}`} title={serie.nome}>{valor == null ? "—" : moeda ? formatCurrency(valor) : numeroGrafico(valor)}</span>
          </div>;
        })}
      </div>)}
    </div>}
    {dados.length > 0 && <DadosDoGrafico dados={dados} series={series} moeda={moeda} />}
  </>;
}

function GraficoSobras({ sobras, separados, fechadas }: { sobras: number; separados: number; fechadas: number }) {
  const valido = separados > 0 && sobras >= 0 && sobras <= separados;
  const percentual = valido ? sobras / separados * 100 : 0;
  const raio = 72, comprimento = 2 * Math.PI * raio;
  return <>
    {!valido ? <div className={styles.emptyChart}>{sobras > separados ? "As sobras superam as saídas. Confira os registros de fechamento." : "Aguardando feiras com saída e fechamento registrados."}</div> : <div className={styles.donutLayout}>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 180 180" role="img" aria-label={`Taxa de sobras: ${percentual.toFixed(1)} por cento`}>
          <circle cx="90" cy="90" r={raio} fill="none" stroke="var(--color-border, #e3e9f0)" strokeWidth="15" />
          <circle cx="90" cy="90" r={raio} fill="none" stroke="#c48122" strokeWidth="15" strokeLinecap={percentual === 0 ? "butt" : "round"}
            strokeDasharray={`${comprimento * percentual / 100} ${comprimento}`} transform="rotate(-90 90 90)" />
        </svg>
        <div className={styles.donutValue}><strong>{percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong><span>de sobras</span></div>
      </div>
      <dl className={styles.donutStats}>
        <div><dt>Sobras registradas</dt><dd>{numeroGrafico(sobras)}</dd></div>
        <div><dt>Saídas dessas feiras</dt><dd>{numeroGrafico(separados)}</dd></div>
        <div><dt>Feiras com fechamento</dt><dd>{fechadas}</dd></div>
      </dl>
    </div>}
    <p className={styles.note}>Considera apenas feiras com saída e fechamento. Sobras registradas não representam o saldo disponível na geladeira.</p>
  </>;
}

type RegistroPrevisao = ReturnType<typeof agruparFaturamento>["registros"][number];
type DiaComparavel = RegistroPrevisao & { centavos: number };

const SERIES_FATURAMENTO: SerieGrafico[] = [
  { chave: "vendas", nome: "Vendas calculadas · fechadas", cor: "#16806a" },
  { chave: "previsao", nome: "Previsão · abertas", cor: "#b7791f" },
];

function pontosFaturamentoSeparados(
  registros: RegistroPrevisao[], porData: boolean, tipo?: TipoLocalFaturamento,
): PontoGrafico[] {
  const grupos = new Map<string, PontoGrafico>();
  for (const registro of registros) {
    if (tipo && registro.tipo !== tipo) continue;
    const id = porData ? registro.data : registro.feiraId;
    const ponto = grupos.get(id) ?? { id,
      nome: porData ? registro.data.split("-").reverse().join("/") : registro.feira,
      valores: { vendas: null, previsao: null } };
    const chave = registro.baseCalculo === "fechamento" ? "vendas" : "previsao";
    if (registro.centavos !== null) ponto.valores[chave] = (ponto.valores[chave] ?? 0) + registro.centavos / 100;
    grupos.set(id, ponto);
  }
  return [...grupos.values()].sort((a, b) => porData ? a.id.localeCompare(b.id) : a.nome.localeCompare(b.nome, "pt-BR"));
}


function DetalhesCalculoFaturamento({ registro, saidas, retornos }: {
  registro: RegistroPrevisao; saidas: Saidas; retornos: Retornos;
}) {
  const fechado = registro.baseCalculo === "fechamento";
  const itens = saidas[registro.chave]?.itens ?? [];
  return <details style={{ width: "100%", minWidth: 0, textAlign: "left" }}>
    <summary style={{ cursor: "pointer", minHeight: 44, alignContent: "center" }}
      aria-label={`Ver cálculo de ${registro.feira} em ${registro.data.split("-").reverse().join("/")}`}>
      Ver cálculo
    </summary>
    {registro.centavos === null ? <p>Não foi possível conferir a saída com o fechamento. Revise os registros desta feira.</p> : <>
      <p>{fechado ? "Vendas calculadas: saída menos sobras de cada sabor." : "Previsão: quantidade da saída, pois ainda não há fechamento."}</p>
      <table className={styles.chartTable}>
        <thead><tr><th scope="col">Sabor</th><th scope="col">Saiu</th><th scope="col">Voltou</th>
          <th scope="col">{fechado ? "Vendeu" : "Previsto"}</th><th scope="col">Preço unitário</th><th scope="col">Subtotal</th></tr></thead>
        <tbody>{itens.map((item) => {
          const retorno = retornos[registro.chave]?.itens.find((valor) => valor.saborId === item.saborId);
          const vendido = registro.itensVendidos?.find((valor) => valor.saborId === item.saborId);
          const quantidade = fechado ? vendido?.quantidade : item.separado;
          const preco = precoVendaCentavos(item, { ...registro, precosVenda: saidas[registro.chave]?.precosVenda });
          return <tr key={item.saborId}><th scope="row">{nomeSabor(item.nome)}</th><td>{item.separado}</td>
            <td>{fechado ? retorno?.sobraram ?? "—" : "—"}</td><td>{quantidade ?? "—"}</td>
            <td>{formatarFaturamento(preco)}</td><td>{quantidade === undefined ? "—" : formatarFaturamento(quantidade * preco)}</td></tr>;
        })}</tbody>
        <tfoot><tr><th scope="row" colSpan={5}>Total {fechado ? "das vendas calculadas" : "previsto"}</th>
          <td>{formatarFaturamento(registro.centavos)}</td></tr></tfoot>
      </table>
      <p className={styles.note}>Preços da feira na data indicada. Descontos, cortesias e perdas durante a feira não estão incluídos.</p>
    </>}
  </details>;
}


function locaisComparaveis(registros: RegistroPrevisao[]) {
  const porLocal = new Map<string, { id: string; nome: string; tipo: TipoLocalFaturamento; dias: DiaComparavel[] }>();
  for (const registro of registros) {
    if (registro.centavos === null) continue;
    const local = porLocal.get(registro.feiraId) ?? {
      id: registro.feiraId, nome: registro.feira, tipo: registro.tipo, dias: [],
    };
    local.dias.push({ ...registro, centavos: registro.centavos });
    porLocal.set(local.id, local);
  }
  return [...porLocal.values()]
    .filter((local) => new Set(local.dias.map((dia) => dia.data)).size >= 2)
    .map((local) => ({ ...local, dias: local.dias.sort((a, b) => b.data.localeCompare(a.data)) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

type SaborRanking = {
  id: string; nome: string; saidas: number; sobras: number; vendidos: number; edicoes: number;
};

function calcularRankingSabores(linhas: Linha[], saidas: Saidas, retornos: Retornos) {
  const sabores = new Map<string, SaborRanking>();
  let fechamentos = 0;
  let invalidos = 0;
  for (const linha of linhas) {
    const retorno = retornos[linha.chave];
    if (!retorno) continue;
    const saida = saidas[linha.chave];
    const vendidos = calcularItensVendidos(saida?.itens, retorno.itens);
    if (!vendidos || !saida) { invalidos++; continue; }
    fechamentos++;
    const nestaEdicao = new Set<string>();
    for (const item of vendidos) {
      const separado = saida.itens.find((valor) => valor.saborId === item.saborId)!.separado;
      if (separado === 0) continue;
      const id = normalizar(item.nome) || item.saborId;
      const sabor = sabores.get(id) ?? { id, nome: nomeSabor(item.nome), saidas: 0, sobras: 0, vendidos: 0, edicoes: 0 };
      sabor.saidas += separado;
      sabor.vendidos += item.quantidade;
      sabor.sobras += separado - item.quantidade;
      if (!nestaEdicao.has(id)) { sabor.edicoes++; nestaEdicao.add(id); }
      sabores.set(id, sabor);
    }
  }
  return { sabores: [...sabores.values()], fechamentos, invalidos };
}

function RankingSaboresFeira({ linhas, saidas, retornos }: {
  linhas: Linha[]; saidas: Saidas; retornos: Retornos;
}) {
  const [localId, setLocalId] = useState("");
  const [ordem, setOrdem] = useState("vendidos");
  const locais = [...new Map(linhas.map((linha) => [linha.feiraId, { id: linha.feiraId, nome: linha.feira }])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const local = locais.find((item) => item.id === localId) ?? locais[0];
  const selecionadas = local ? linhas.filter((linha) => linha.feiraId === local.id) : [];
  const ranking = calcularRankingSabores(selecionadas, saidas, retornos);
  const taxa = (item: SaborRanking) => item.saidas > 0 ? item.sobras / item.saidas * 100 : 0;
  const porVenda = [...ranking.sabores].sort((a, b) => b.vendidos - a.vendidos || a.nome.localeCompare(b.nome, "pt-BR"));
  const porSobra = [...ranking.sabores].sort((a, b) => b.sobras - a.sobras || a.nome.localeCompare(b.nome, "pt-BR"));
  const ordenados = ordem === "sobras" ? porSobra : ordem === "taxa"
    ? [...ranking.sabores].sort((a, b) => taxa(b) - taxa(a) || b.saidas - a.saidas || a.nome.localeCompare(b.nome, "pt-BR"))
    : porVenda;
  return <section className={styles.panel} aria-labelledby="ranking-sabores-feira">
    <div className={styles.heading}><div>
      <h2 id="ranking-sabores-feira">Ranking de sabores por feira</h2>
      <p>Confira os mais vendidos e os que mais voltam no período selecionado.</p>
    </div></div>
    {!local ? <p>Nenhuma feira ou evento nos filtros selecionados.</p> : <>
      <div className={styles.filters}>
        <label>Feira ou evento<select value={local.id} onChange={(evento) => setLocalId(evento.target.value)}>
          {locais.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select></label>
        <label>Ordenar tabela<select value={ordem} onChange={(evento) => setOrdem(evento.target.value)}>
          <option value="vendidos">Mais vendidos</option><option value="sobras">Mais sobras em unidades</option>
          <option value="taxa">Maior percentual de sobra</option>
        </select></label>
      </div>
      <p className={styles.note}>{ranking.fechamentos} edições com fechamento válido · {selecionadas.filter((linha) => !retornos[linha.chave]).length} sem fechamento, fora do ranking.
        {ranking.invalidos > 0 && ` ${ranking.invalidos} fechamento(s) inconsistente(s), fora do cálculo.`}</p>
      {!ordenados.length ? <p>Sem sabores com saída positiva e fechamento válido para este local no período.</p> : <>
        <div className={styles.chartGrid}>
          <div style={{ minWidth: 0 }}><h3>Mais vendidos · até 5 sabores</h3>
            <GraficoBarras dados={porVenda.filter((item) => item.vendidos > 0).slice(0, 5).map((item) => ({ id: item.id, nome: item.nome, valores: { quantidade: item.vendidos } }))}
              series={[{ chave: "quantidade", nome: "Vendidos", cor: "#16806a" }]} vazio="Nenhum pastel vendido nos fechamentos selecionados." />
          </div>
          <div style={{ minWidth: 0 }}><h3>Mais sobras · até 5 sabores</h3>
            <GraficoBarras dados={porSobra.filter((item) => item.sobras > 0).slice(0, 5).map((item) => ({ id: item.id, nome: item.nome, valores: { quantidade: item.sobras } }))}
              series={[{ chave: "quantidade", nome: "Sobras", cor: "#b7791f" }]} vazio="Nenhuma sobra nos fechamentos selecionados." />
          </div>
        </div>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`Ranking de sabores de ${local.nome}`}>
          <table className={styles.chartTable}><thead><tr><th scope="col">Posição</th><th scope="col">Sabor</th>
            <th scope="col">Edições com saída</th><th scope="col">Saiu</th><th scope="col">Vendeu</th><th scope="col">Voltou</th><th scope="col">Sobra (%)</th></tr></thead>
            <tbody>{ordenados.map((item, indice) => <tr key={item.id}><td>{indice + 1}</td><th scope="row">{item.nome}</th>
              <td>{item.edicoes}</td><td>{item.saidas}</td><td>{item.vendidos}</td><td>{item.sobras}</td>
              <td>{taxa(item).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td></tr>)}</tbody>
          </table>
        </div>
      </>}
      <p className={styles.note}>Percentual de sobra = total que voltou ÷ total que saiu × 100. São consideradas apenas as edições fechadas deste cadastro, dentro dos filtros de período e local. Sabores sem saída não entram no ranking. Confira o número de edições antes de ajustar o planejamento. As sobras representam o retorno original, mesmo quando reaproveitado, doado ou descartado depois.</p>
    </>}
  </section>;
}

function variacaoFaturamento(base: number, comparada: number) {
  const diferenca = comparada - base;
  return { diferenca, percentual: base === 0 ? null : diferenca / base * 100 };
}

function ComparacaoFaturamento({ registros, saidas }: { registros: RegistroPrevisao[]; saidas: Saidas }) {
  const locais = useMemo(() => locaisComparaveis(registros), [registros]);
  const [localId, setLocalId] = useState("");
  const [dataBase, setDataBase] = useState("");
  const [dataComparada, setDataComparada] = useState("");
  const local = locais.find((opcao) => opcao.id === localId) ?? locais[0];
  const datas = local?.dias ?? [];
  const comparada = datas.find((dia) => dia.data === dataComparada) ?? datas[0];
  const outrasDatas = datas.filter((dia) => dia.data !== comparada?.data);
  const base = outrasDatas.find((dia) => dia.data === dataBase) ?? outrasDatas[0];
  const formatarData = (data: string) => data.split("-").reverse().join("/");
  const variacao = base && comparada ? variacaoFaturamento(base.centavos, comparada.centavos) : null;

  const porSabor = new Map<string, { nome: string; base: number; comparada: number }>();
  if (base && comparada) {
    for (const [coluna, dia] of [["base", base], ["comparada", comparada]] as const) {
      const itensComparados = dia.baseCalculo === "fechamento"
        ? (dia.itensVendidos ?? []).map((item) => ({ id: item.saborId, nome: nomeSabor(item.nome), separados: item.quantidade }))
        : saboresDaFeira(dia.chave, {}, saidas, {});
      for (const sabor of itensComparados) {
        const linha = porSabor.get(sabor.id) ?? { nome: sabor.nome, base: 0, comparada: 0 };
        linha[coluna] += sabor.separados ?? 0;
        porSabor.set(sabor.id, linha);
      }
    }
  }
  const sabores = [...porSabor].sort(([, a], [, b]) => a.nome.localeCompare(b.nome, "pt-BR"));
  const sinal = (numero: number) => numero > 0 ? "+" : "";

  return (
    <section className={styles.panel} aria-labelledby="comparar-datas-faturamento">
      <div className={styles.heading}><div>
        <h2 id="comparar-datas-faturamento">Comparar faturamento entre datas</h2>
        <p>Compare duas datas do mesmo local. Com fechamento: vendas calculadas; sem fechamento: previsão pela saída. A variação também reflete reajustes de preço.</p>
      </div></div>
      {!local || !base || !comparada || !variacao ? (
        <p className={styles.emptyChart}>São necessárias duas datas com saídas conferidas e calculáveis no mesmo cadastro. Amplie o período ou selecione todas as feiras e eventos.</p>
      ) : (
        <>
          <div className={styles.filters}>
            <label>Feira ou evento
              <select value={local.id} onChange={(evento) => {
                setLocalId(evento.target.value);
                setDataBase("");
                setDataComparada("");
              }}>
                {locais.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.nome} · {opcao.tipo === "evento" ? "Evento" : "Feira"}</option>)}
              </select>
            </label>
            <label>Data-base
              <select value={base.data} onChange={(evento) => setDataBase(evento.target.value)}>
                {datas.map((dia) => <option key={dia.data} value={dia.data} disabled={dia.data === comparada.data}>{formatarData(dia.data)}</option>)}
              </select>
            </label>
            <label>Data comparada
              <select value={comparada.data} onChange={(evento) => setDataComparada(evento.target.value)}>
                {datas.map((dia) => <option key={dia.data} value={dia.data} disabled={dia.data === base.data}>{formatarData(dia.data)}</option>)}
              </select>
            </label>
          </div>
          <div className={styles.massSummary} aria-live="polite">
            <div><span>{base.baseCalculo === "fechamento" ? "Vendas calculadas" : "Previsto"} · {formatarData(base.data)}</span><strong>{formatarFaturamento(base.centavos)}</strong></div>
            <div><span>{comparada.baseCalculo === "fechamento" ? "Vendas calculadas" : "Previsto"} · {formatarData(comparada.data)}</span><strong>{formatarFaturamento(comparada.centavos)}</strong></div>
            <div><span>Diferença em relação à data-base</span>
              <strong>{sinal(variacao.diferenca)}{formatarFaturamento(variacao.diferenca)}</strong>
              <span>{variacao.percentual === null ? "Percentual indisponível: a data-base tem valor zero."
                : `${sinal(variacao.percentual)}${variacao.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</span>
            </div>
          </div>
          <GraficoBarras dados={[
            { id: base.data, nome: formatarData(base.data), valores: {
              vendas: base.baseCalculo === "fechamento" ? base.centavos / 100 : null,
              previsao: base.baseCalculo === "previsao" ? base.centavos / 100 : null } },
            { id: comparada.data, nome: formatarData(comparada.data), valores: {
              vendas: comparada.baseCalculo === "fechamento" ? comparada.centavos / 100 : null,
              previsao: comparada.baseCalculo === "previsao" ? comparada.centavos / 100 : null } },
          ]} series={SERIES_FATURAMENTO} moeda vazio="Selecione duas datas." />
          <details className={styles.chartData}>
            <summary>Ver quantidades por sabor</summary><p className={styles.note}>Nas datas fechadas, são mostradas as quantidades vendidas (saída menos sobras). Nas demais, são mostradas as quantidades da saída. Confira a base de cada data antes de comparar.</p>
            <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Comparação das saídas por sabor">
              <table className={styles.chartTable}>
                <thead><tr><th scope="col">Sabor</th><th scope="col">{formatarData(base.data)}</th><th scope="col">{formatarData(comparada.data)}</th><th scope="col">Diferença</th></tr></thead>
                <tbody>{sabores.map(([id, sabor]) => <tr key={id}>
                  <th scope="row">{sabor.nome}</th><td>{sabor.base}</td><td>{sabor.comparada}</td>
                  <td>{sinal(sabor.comparada - sabor.base)}{sabor.comparada - sabor.base}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className={styles.note}>Considera o período e o local selecionados acima. É uma previsão pelas saídas conferidas.</p>
    </section>
  );
}

function RelatoriosConteudo() {
  const { usuario } = useAuth();

  const [fim, setFim] =
    useState(hojeBrasil);

  const [inicio, setInicio] =
    useState(() => `${hojeBrasil().slice(0, 7)}-01`);

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

  const [periodoConsumos, setPeriodoConsumos] = useState("");

  const [descartes, setDescartes] =
    useState<DescarteRelatorio[]>([]);

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
              setPeriodoConsumos(`${usuario?.id ?? ""}|${inicio}|${fim}`);
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

  const [custosOrdens, setCustosOrdens] = useState<Record<string, CustoOrdemRelatorio>>({});
  const [periodoComplemento, setPeriodoComplemento] = useState("");
  const chavePeriodo = `${usuario?.id ?? ""}|${inicio}|${fim}`;
  const complementoAtual = periodoComplemento === chavePeriodo;
  const consumosAtuais = periodoConsumos === chavePeriodo;

  useEffect(() => {
    if (!usuario?.id || !dono || !inicio || !fim || inicio > fim) return;
    let ativo = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCarregandoOrdens(true);
      setCarregandoDescartes(true);
      setErroOrdens("");
      setErroDescartes("");
      void consultarComplementoRelatorio(inicio, fim, controller.signal)
        .then((dados) => {
          if (!ativo) return;
          setOrdens(dados.ordens);
          setCustosOrdens(dados.custosPorOrdem);
          setDescartes(dados.descartes);
          setPeriodoComplemento(chavePeriodo);
        })
        .catch((falha: unknown) => {
          if (!ativo) return;
          const mensagem = falha instanceof Error ? falha.message : "Erro ao consultar relatório.";
          setErroOrdens(mensagem);
          setErroDescartes(mensagem);
          setOrdens([]);
          setCustosOrdens({});
          setDescartes([]);
        })
        .finally(() => {
          if (!ativo) return;
          setCarregandoOrdens(false);
          setCarregandoDescartes(false);
        });
    }, 0);
    return () => {
      ativo = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [usuario?.id, dono, inicio, fim, chavePeriodo]);

  const linhas = useMemo<
    Linha[]
  >(() => {
    const chaves = new Set([
      ...Object.keys(planos),
      ...Object.keys(saidas),
      ...Object.keys(retornos),
      ...Object.keys(producoes),
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
          tipo: tipoLocalFaturamento({ id, nome: feira?.nome ?? id, tipo: feira?.tipo }),

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
    producoes,
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

  const descartesFiltrados = descartes.filter((item) => !feiraId || item.feiraId === feiraId);
  const perdasConfirmadas = descartesFiltrados
  .filter((item) => item.tipo !== "doacao")
  .reduce((total, item) => total + item.quantidade, 0);

  const doacoesConfirmadas = descartesFiltrados
  .filter((item) => item.tipo === "doacao")
  .reduce((total, item) => total + item.quantidade, 0);

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

  const custosPorOrdem = useMemo(() => new Map(Object.entries(custosOrdens)), [custosOrdens]);

  function calcularCustosMassa(
    ordem: OrdemRemota,
  ) {
    const custo =
      custosPorOrdem.get(ordem.id);

    const resultado =
      ordem.resultadoMassa;

    const custoTotal =
      complementoAtual && !erroOrdens &&
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

  const producaoDisponivel = !carregandoProducao && !erroProducao;
  const custosDisponiveis = consumosAtuais && !carregandoCustos && !erroCustos;
  const descartesDisponiveis = complementoAtual && !carregandoDescartes && !erroDescartes;
  const dadosDashboard = useMemo(() => agruparOperacao(
    linhas, planos, saidas, retornos, producoes, inicio, fim,
  ), [linhas, planos, saidas, retornos, producoes, inicio, fim]);
  const faturamento = useMemo(() => agruparFaturamento(linhas, saidas, retornos), [linhas, saidas, retornos]);

  const resumoValores = useMemo(() => {
    const somar = (base: "fechamento" | "previsao", tipo?: TipoLocalFaturamento) => {
      const registros = faturamento.registros.filter((item) => item.baseCalculo === base && (!tipo || item.tipo === tipo));
      const validos = registros.filter((item) => item.centavos !== null);
      return { centavos: validos.length ? validos.reduce((total, item) => total + (item.centavos ?? 0), 0) : null,
        quantidade: registros.length, invalidos: registros.length - validos.length };
    };
    return { vendas: somar("fechamento"), previsao: somar("previsao"),
      feiras: somar("fechamento", "feira"), eventos: somar("fechamento", "evento") };
  }, [faturamento]);

  function exportarFaturamento() {
    if (!podeMostrar || !faturamento.registros.length) return;
    baixarCsv(`faturamento-${inicio}-a-${fim}.csv`,
      ["Data", "Local ID", "Feira ou evento", "Tipo", "Faturamento calculado ou previsto (BRL)", "Situação do valor"],
      faturamento.registros.map(item => [item.data, item.feiraId, item.feira, item.tipo === "evento" ? "Evento" : "Feira",
        item.centavos === null ? null : item.centavos / 100,
        item.centavos === null ? "Dados inválidos na saída ou no fechamento" : item.baseCalculo === "fechamento" ? "Vendas calculadas pelo fechamento" : "Previsão pela saída"]));
  }

  function escolherPeriodo(dias: number | "mes") {
    const hoje = hojeBrasil();
    setFim(hoje);
    setInicio(dias === "mes" ? `${hoje.slice(0, 7)}-01` : diasAtras(hoje, dias - 1));
  }

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
        "Chave da feira",
        "Feira ID",
        "Data",
        "Feira",
        "Responsáveis",
        "Planejados",
        "Separados",
        "Sobras",
      ],
      linhas.map((linha) => [
        linha.chave,
        linha.feiraId,
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
        "Chave da feira",
        "Feira ID",
        "Data",
        "Feira",
        "Responsáveis",
        "Chave normalizada do sabor",
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
          feira.chave,
          feira.feiraId,
          feira.data,
          feira.feira,
          feira.responsaveis,
          sabor.id,
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
      !complementoAtual ||
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
          ordem.id,
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
        "Ordem ID",
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
        "Exportado em UTC",
        "Produto ID",
        "Local",
        "Ingrediente",
        "Categoria",
        "Lote",
        "Validade",
        "Quantidade",
        "Unidade",
        "Custo unitário",
        "Valor em estoque",
        "Situação",
      ],
      itensOrdenados.map(
        (item) => [
          new Date().toISOString(),
          item.id,
          localEstoque ===
          "principal"
            ? "Principal"
            : "Cozinha",

          item.nome,
          item.categoria,
          item.lote,
          item.validade,
          item.quantidade,
          item.unidade,
          Number.isFinite(item.custoUnitario) && item.custoUnitario >= 0 ? item.custoUnitario : null,
          Number.isFinite(item.custoUnitario) && item.custoUnitario >= 0 ? item.quantidade * item.custoUnitario : null,
          item.situacao,
        ],
      ),
    );
  }

  const valorEstoque = itensOrdenados.reduce((total, item) =>
    total + (Number.isFinite(item.custoUnitario) && item.custoUnitario >= 0
      ? item.quantidade * item.custoUnitario : 0), 0);
  const estoqueSemCusto = itensOrdenados.some((item) =>
    !Number.isFinite(item.custoUnitario) || item.custoUnitario < 0);

  function exportarOrdens() {
    if (!dono || !complementoAtual || carregandoOrdens || erroOrdens || periodoInvalido) return;
    baixarCsv(`ordens-${inicio}-a-${fim}.csv`,
      ["Ordem ID", "Código", "Data de produção", "Prato", "Categoria", "Quantidade planejada", "Unidade", "Status", "Responsável", "Custo dos insumos acumulado até a consulta", "Registros de consumo", "Consumos sem custo"],
      ordens.map((ordem) => {
        const custo = custosOrdens[ordem.id];
        return [ordem.id, ordem.codigo, ordem.dataProducao, ordem.prato, ordem.categoria,
          ordem.quantidade, ordem.unidade, ordem.status, ordem.responsavel,
          custo && custo.quantidadeRegistros > 0 && custo.registrosSemCusto === 0 ? custo.custoTotal : null,
          custo?.quantidadeRegistros ?? 0, custo?.registrosSemCusto ?? 0];
      }));
  }

  function exportarConsumos() {
    if (!dono || !consumosAtuais || carregandoCustos || erroCustos || periodoInvalido) return;
    baixarCsv(`consumos-${inicio}-a-${fim}.csv`,
      ["Consumo ID", "Registrado em UTC", "Produto ID", "Ordem ID", "Ordem", "Ingrediente", "Lote", "Quantidade", "Unidade", "Custo unitário", "Custo total", "Responsável", "Finalidade"],
      consumos.map((item) => [item.id, item.registradoEm, item.produtoId, item.ordemId, item.ordemCodigo,
        item.nome, item.lote, item.quantidade, item.unidade, item.custoUnitario,
        typeof item.custoUnitario === "number" && Number.isFinite(item.custoUnitario) && item.custoUnitario >= 0
          ? item.quantidade * item.custoUnitario : null, item.registradoPor, item.finalidade]));
  }

  function exportarDescartes() {
    if (!dono || !complementoAtual || carregandoDescartes || erroDescartes || periodoInvalido) return;
    baixarCsv(`descartes-e-doacoes-${inicio}-a-${fim}.csv`,
      ["Movimento ID", "Tipo", "Registrado em UTC", "Data da feira de origem", "Feira ID", "Sabor ID", "Quantidade", "Motivo / observação", "Destinatário", "Responsável"],
      descartesFiltrados.map((item) => [item.id, item.tipo === "doacao" ? "Doação" : "Descarte", item.registradoEm, item.dataFeira, item.feiraId,
        item.saborId, item.quantidade, item.motivo, item.destinatario ?? "", item.registradoPor]));
  }

  function exportarProducao() {
    if (!podeMostrar || carregandoProducao || erroProducao) return;
    baixarCsv(`producao-feiras-${inicio}-a-${fim}.csv`,
      ["Registro ID", "Data da feira", "Feira ID", "Sabor ID", "Funcionário ID", "Funcionário", "Quantidade"],
      linhas.flatMap((linha) => (producoes[linha.chave] ?? []).map((item) => [
        `${item.feira}|${item.saborId}|${item.funcionarioId}`, linha.data, linha.feiraId,
        item.saborId, item.funcionarioId, item.funcionario, item.quantidade])));
  }

  return (
    <AppLayout
      title="Dashboard do dono"
      subtitle="Produção, feiras e custos em uma visão integrada."
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
            <section className={styles.dashboardIntro} aria-label="Resumo do painel">
              <div><span className={styles.eyebrow}>PASTEL SAITO · GESTÃO</span>
                <h2>Visão da operação</h2>
                <p>Acompanhe a produção e entenda o resultado de cada feira.</p>
              </div>
              <div className={styles.introBadge}><BarChart3 size={19} aria-hidden="true" />
                <span>{feiraId ? feirasCadastradas.find(item => item.id === feiraId)?.nome ?? feiraId : "Todas as feiras e eventos"}</span>
              </div>
            </section>

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
                    Filtros do dashboard
                  </h2>

                  <p>
                    Escolha o período e a feira. Custos da cozinha, massa e estoque têm seus próprios escopos indicados nos painéis.
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
                  Consultar mês
                  <input
                    type="month"
                    value={inicio.slice(0, 7)}
                    onChange={(evento) => {
                      const selecionado = evento.target.value;
                      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selecionado)) return;
                      const ano = Number(selecionado.slice(0, 4));
                      if (ano < 2020) return;
                      const ultimoDia = new Date(`${selecionado}-01T12:00:00Z`);
                      ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
                      setInicio(`${selecionado}-01`);
                      setFim(ultimoDia.toISOString().slice(0, 10));
                    }}
                    min="2020-01"
                  />
                </label>

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
                  Feira ou evento

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
                      Todas as feiras e eventos
                    </option>

                    {feirasCadastradas.map(
                      (feira) => (
                        <option
                          value={
                            feira.id
                          }
                          key={feira.id}
                        >
                          {feira.nome}{tipoLocalFaturamento(feira) === "evento" ? " · Evento" : " · Feira"}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <div className={styles.quickFilters} aria-label="Períodos rápidos">
                <button type="button" onClick={() => escolherPeriodo(7)}>Últimos 7 dias</button>
                <button type="button" onClick={() => escolherPeriodo(30)}>Últimos 30 dias</button>
                <button type="button" onClick={() => escolherPeriodo("mes")}>Este mês</button>
                <span>{inicio && fim ? `${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}` : "Selecione as datas"}</span>
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

            {!podeMostrar ? (
              <div className={styles.dashboardNotice} role={erro || periodoInvalido ? "alert" : "status"}>
                {periodoInvalido ? "Selecione um período válido para consultar os gráficos." : erro || "Carregando os registros para montar seu dashboard…"}
              </div>
            ) : (
              <>
                <section className={styles.panel} aria-labelledby="resumo-faturamento">
                  <div className={styles.heading}>
                    <div><h2 id="resumo-faturamento">Faturamento · feiras e eventos</h2>
                      <p>Com fechamento: saída menos sobras por sabor × preço da feira na data. Sem fechamento: previsão pela saída. Feiras e eventos ficam separados e também compõem o total geral.</p></div>
                    <Button type="button" variant="secondary" onClick={exportarFaturamento}
                      disabled={!faturamento.registros.length}>Exportar faturamento CSV</Button>
                  </div>
                  <div className={styles.massSummary}>
                    <div><span>Vendas calculadas · feiras fechadas</span><strong>{resumoValores.vendas.centavos === null ? "—" : formatarFaturamento(resumoValores.vendas.centavos)}</strong>
                      <small>{resumoValores.vendas.quantidade} fechamentos · {resumoValores.vendas.invalidos} sem cálculo válido</small></div>
                    <div><span>Previsão · feiras ainda abertas</span><strong>{resumoValores.previsao.centavos === null ? "—" : formatarFaturamento(resumoValores.previsao.centavos)}</strong>
                      <small>{resumoValores.previsao.quantidade} saídas sem fechamento · valor ainda não vendido</small></div>
                    <div><span>Vendas calculadas · composição</span>
                      <span>Feiras: {resumoValores.feiras.centavos === null ? "—" : formatarFaturamento(resumoValores.feiras.centavos)}</span>
                      <span>Eventos: {resumoValores.eventos.centavos === null ? "—" : formatarFaturamento(resumoValores.eventos.centavos)}</span></div>
                  </div>
                  <p className={styles.note}>Saídas calculadas: {faturamento.calculadas} de {faturamento.saidas}. Liberdade está classificada como evento. Os totais respeitam o período e o local selecionados; “—” indica que não há uma saída calculável nessa categoria.</p>
                  <p className={styles.note}>{faturamento.semCalculo > 0
                    ? "Total parcial: há saídas ou fechamentos com dados inválidos. Esses registros não são tratados como zero."
                    : faturamento.saidas === 0 ? "Confirme a saída de uma feira para preencher os gráficos automaticamente."
                    : "Todas as saídas conferidas deste filtro foram calculadas."}
                    {" "}Feiras sem saída conferida não entram na soma. Preços por feira e data: o reajuste vale a partir de 10/11/2026; datas anteriores mantêm os preços antigos. Os cards separam as vendas calculadas das previsões. Nos gráficos, verde representa vendas calculadas e laranja representa previsões, em séries separadas. O cálculo pressupõe que saída menos sobras corresponde às vendas; não considera descontos, cortesias ou perdas durante a feira e não representa caixa conferido nem lucro. Descartes e doações das sobras após o fechamento não são vendas.</p>
                </section>

                <p className={styles.note}>Fechadas: {faturamento.fechadas} · Ainda em previsão: {faturamento.previstas}. Registros inválidos ficam fora da soma.</p>
                <ComparacaoFaturamento registros={faturamento.registros} saidas={saidas} />
                <RankingSaboresFeira linhas={linhas} saidas={saidas} retornos={retornos} />

                <section className={styles.kpiGrid} aria-label="Resumo do período">
                  <article className={styles.kpiCard}><span className={styles.kpiIcon}><CalendarDays size={20} aria-hidden="true" /></span>
                    <span className={styles.kpiLabel}>Feiras com registros</span><strong>{numeroGrafico(linhas.length)}</strong>
                    <small>{feirasFechadas.length} com saída e fechamento</small></article>
                  <article className={styles.kpiCard}><span className={styles.kpiIcon}><ClipboardList size={20} aria-hidden="true" /></span>
                    <span className={styles.kpiLabel}>Pastéis planejados</span><strong>{numeroGrafico(totais.planejados)}</strong>
                    <small>Quantidade prevista para as feiras</small></article>
                  <article className={styles.kpiCard}><span className={`${styles.kpiIcon} ${styles.greenIcon}`}><ChefHat size={20} aria-hidden="true" /></span>
                    <span className={styles.kpiLabel}>Produção registrada</span><strong>{producaoDisponivel ? numeroGrafico(producaoRegistrada) : "—"}</strong>
                    <small>{erroProducao ? "Falha ao consultar produção" : carregandoProducao ? "Carregando produção…" : "Acumulado por feira e funcionário"}</small></article>
                  <article className={styles.kpiCard}><span className={`${styles.kpiIcon} ${styles.amberIcon}`}><PackageCheck size={20} aria-hidden="true" /></span>
                    <span className={styles.kpiLabel}>Saídas conferidas</span><strong>{numeroGrafico(totais.separados)}</strong>
                    <small>{linhas.filter(linha => linha.separados !== null).length} saídas registradas</small></article>
                </section>

                <section className={styles.secondaryKpis} aria-label="Sobras, perdas e custos">
                  <div><span>Sobras registradas</span><strong>{numeroGrafico(totais.sobras)} <small>pastéis</small></strong><p>Retornos das feiras no período</p></div>
                  <div><span>Descartes confirmados</span><strong>{descartesDisponiveis ? numeroGrafico(perdasConfirmadas) : "—"} <small>pastéis</small></strong><p>Pela data do descarte registrado</p></div>
                  <div><span>Doações confirmadas</span><strong>{descartesDisponiveis ? numeroGrafico(doacoesConfirmadas) : "—"} <small>pastéis</small></strong><p>Pela data da doação registrada</p></div>
                  <div><span>Custo dos insumos · cozinha inteira</span><strong>{custosDisponiveis && consumos.length > 0 && consumosSemCusto === 0 ? formatCurrency(custoInsumos) : "—"}</strong>
                    <p>{!custosDisponiveis ? "Aguardando consulta dos custos" : consumosSemCusto > 0 ? `${consumosSemCusto} consumo(s) sem custo histórico` : !consumos.length ? "Nenhum consumo registrado" : "Insumos consumidos; sem mão de obra"}</p></div>
                </section>

                {(erroProducao || erroCustos || erroDescartes) && <div role="alert" className={styles.dashboardNotice}>
                  {[erroProducao, erroCustos, erroDescartes].filter(Boolean).join(" ")}
                </div>}
                {linhas.length === 0 && <div className={styles.dashboardNotice}>
                  Não há registros de feiras neste período. Os gráficos serão preenchidos conforme os planejamentos e movimentos forem salvos.
                </div>}

                <div className={styles.chartGrid}>
                  <section className={`${styles.chartCard} ${styles.chartWide}`} aria-labelledby="evolucao-faturamento">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>VENDAS E PREVISÕES SEPARADAS</span>
                      <h2 id="evolucao-faturamento">Evolução por data</h2><p>Feiras e eventos por data, em reais. Vendas e previsões são mostradas separadamente.</p></div></div>
                    <GraficoBarras dados={pontosFaturamentoSeparados(faturamento.registros, true)} series={SERIES_FATURAMENTO} moeda vazio="Nenhuma saída conferida nas datas selecionadas." />
                    <p className={styles.note}>Dias sem saída conferida são omitidos. Valores inválidos ficam fora da soma, que pode ser parcial. “—” indica ausência de valor calculável nessa série. A data é a da feira.</p>
                  </section>
                  <section className={styles.chartCard} aria-labelledby="comparacao-faturamento">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>FEIRAS · VALORES EM REAIS</span>
                      <h2 id="comparacao-faturamento">Faturamento por feira</h2><p>Somente feiras, sem os eventos.</p></div></div>
                    <GraficoBarras dados={pontosFaturamentoSeparados(faturamento.registros, false, "feira")}
                      series={SERIES_FATURAMENTO} moeda
                      vazio="Nenhuma saída de feira nos filtros selecionados." />
                  </section>
                  <section className={styles.chartCard} aria-labelledby="faturamento-eventos">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>EVENTOS · VALORES EM REAIS</span>
                      <h2 id="faturamento-eventos">Faturamento por evento</h2><p>Eventos apresentados separadamente, incluindo Liberdade.</p></div></div>
                    <GraficoBarras dados={pontosFaturamentoSeparados(faturamento.registros, false, "evento")}
                      series={SERIES_FATURAMENTO} moeda
                      vazio="Nenhuma saída de evento nos filtros selecionados." />
                  </section>
                  <section className={`${styles.chartCard} ${styles.chartWide}`} aria-labelledby="valores-faturamento">
                    <div className={styles.chartHeading}><div><h2 id="valores-faturamento">Valores por feira e evento</h2>
                      <p>Detalhamento das saídas usadas no total geral.</p></div></div>
                    <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Faturamento por feira e evento">
                      <table className={styles.chartTable}>
                        <thead><tr><th scope="col">Data</th><th scope="col">Local</th><th scope="col">Tipo</th><th scope="col">Base do cálculo</th><th scope="col">Faturamento</th></tr></thead>
                        <tbody>{faturamento.registros.map(item => <Fragment key={item.chave}>
                          <tr>
                            <td>{item.data.split("-").reverse().join("/")}</td><th scope="row">{item.feira}</th>
                            <td>{item.tipo === "evento" ? "Evento" : "Feira"}</td>
                            <td>{item.baseCalculo === "fechamento" ? "Vendas calculadas" : "Previsão pela saída"}</td>
                            <td>{item.centavos === null ? "Não calculado" : formatarFaturamento(item.centavos)}</td>
                          </tr>
                          <tr>
                            <td colSpan={5} style={{ textAlign: "left", verticalAlign: "top", whiteSpace: "normal" }}>
                              <DetalhesCalculoFaturamento registro={item} saidas={saidas} retornos={retornos} />
                            </td>
                          </tr>
                        </Fragment>)}</tbody>
                      </table>
                      {!faturamento.registros.length && <p className={styles.note}>Nenhuma saída conferida nos filtros selecionados.</p>}
                    </div>
                  </section>

                  <section className={`${styles.chartCard} ${styles.chartWide}`} aria-labelledby="grafico-evolucao">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>VOLUME DE PASTÉIS</span><h2 id="grafico-evolucao">Planejamento e produção</h2>
                      <p>Agrupado por {dadosDashboard.agrupamento}, pela data da feira.</p></div><span className={styles.chartPill}>Unidades</span></div>
                    <GraficoColunas dados={dadosDashboard.periodos} series={producaoDisponivel ? SERIES_OPERACAO : SERIES_OPERACAO.filter(serie => serie.chave !== "produzidos")}
                      titulo="Planejamento, produção registrada e saídas conferidas por data da feira" />
                    {!producaoDisponivel && <p className={styles.note}>A série de produção está indisponível até a consulta ser concluída.</p>}
                    <p className={styles.note}>Datas sem registros são omitidas. A produção é o acumulado destinado à feira, não a data em que cada pastel foi feito.</p>
                  </section>

                  <section className={styles.chartCard} aria-labelledby="grafico-sobras">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>RETORNO DAS FEIRAS</span><h2 id="grafico-sobras">Taxa de sobras</h2>
                      <p>Retorno em relação às saídas das feiras fechadas.</p></div></div>
                    <GraficoSobras sobras={sobrasFechadas} separados={taxaSobras} fechadas={feirasFechadas.length} />
                  </section>

                  <section className={styles.chartCard} aria-labelledby="grafico-feiras">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>COMPARAÇÃO</span><h2 id="grafico-feiras">Resultado por feira</h2>
                      <p>Selecione o nome para filtrar os dados das feiras.</p></div>
                      {feiraId && <button className={styles.clearFilter} onClick={() => setFeiraId("")} type="button">Ver todas</button>}</div>
                    <GraficoBarras dados={dadosDashboard.feiras} series={SERIES_FEIRAS} selecionado={feiraId}
                      onSelecionar={id => setFeiraId(atual => atual === id ? "" : id)} vazio="Nenhuma feira com registros neste período." />
                    <p className={styles.note}>“—” significa ausência de registro; zero é uma contagem confirmada. As saídas e sobras podem ter coberturas diferentes.</p>
                  </section>

                  <section className={styles.chartCard} aria-labelledby="grafico-sabores">
                    <div className={styles.chartHeading}><div><span className={styles.eyebrow}>MIX DE PRODUTOS</span><h2 id="grafico-sabores">Sabores com mais sobras</h2>
                      <p>Até 8 sabores, ordenados pela quantidade de sobras.</p></div><span className={styles.chartPill}>Top 8</span></div>
                    <GraficoBarras dados={dadosDashboard.sabores.filter(dado => (dado.valores.sobras ?? 0) > 0).slice(0, 8)} series={SERIES_FEIRAS}
                      vazio="Nenhuma sobra positiva registrada nos filtros selecionados." />
                    <p className={styles.note}>Compara quantidades absolutas, não taxa de sobra ou vendas. Consulte os demais sabores nas tabelas detalhadas.</p>
                  </section>




                </div>
              </>
            )}

            <details className={styles.reportDetails}>
              <summary><span>Consultar tabelas e exportações</span><small>Feiras, sabores, massa e estoque atual</small></summary>
              <div className={styles.detailPanels}>
            <section className={styles.panel} aria-label="Exportações detalhadas">
              <h2>Dados para análise</h2>
              <p>CSV em UTF-8, separado por ponto e vírgula, com ponto decimal. Datas e horas identificadas como UTC devem ser convertidas para São Paulo na análise.</p>
              <p>Consumos abrangem toda a cozinha. Descartes e doações usam a data do registro e respeitam a feira selecionada. Produção de feira representa o acumulado por feira, sabor e funcionário, não cada evento de produção.</p>
              <div className={styles.heading}>
                <Button type="button" variant="secondary" onClick={exportarOrdens}
                  disabled={!complementoAtual || carregandoOrdens || Boolean(erroOrdens) || periodoInvalido || !ordens.length}>
                  Exportar ordens CSV
                </Button>
                <Button type="button" variant="secondary" onClick={exportarConsumos}
                  disabled={!consumosAtuais || carregandoCustos || Boolean(erroCustos) || periodoInvalido || !consumos.length}>
                  Exportar consumos CSV
                </Button>
                <Button type="button" variant="secondary" onClick={exportarDescartes}
                  disabled={!complementoAtual || carregandoDescartes || Boolean(erroDescartes) || periodoInvalido || !descartesFiltrados.length}>
                  Exportar descartes e doações CSV
                </Button>
                <Button type="button" variant="secondary" onClick={exportarProducao}
                  disabled={!podeMostrar || carregandoProducao || Boolean(erroProducao) || !linhas.length}>
                  Exportar produção CSV
                </Button>
              </div>
            </section>
            <details className={styles.panel}>
              <summary style={{ cursor: "pointer", minHeight: 44 }}>
                <strong>Histórico de descartes e doações</strong>
              </summary>
              {!descartesDisponiveis ? (
                <p role="status">{erroDescartes || "Carregando registros..."}</p>
              ) : descartesFiltrados.length === 0 ? (
                <p>Nenhum registro no período e na feira selecionados.</p>
              ) : (
                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead><tr>
                      <th>Data do registro</th><th>Tipo</th><th>Lote de origem</th>
                      <th>Quantidade</th><th>Motivo / observação</th>
                      <th>Destinatário</th><th>Responsável</th>
                    </tr></thead>
                    <tbody>
                      {[...descartesFiltrados]
                        .sort((a, b) => b.registradoEm.localeCompare(a.registradoEm))
                        .map((item) => (
                          <tr key={item.id}>
                            <td>{new Date(item.registradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                            <td>{item.tipo === "doacao" ? "Doação" : "Descarte"}</td>
                            <td>{item.feiraId} · {item.dataFeira.split("-").reverse().join("/")} · {item.saborId}</td>
                            <td>{item.quantidade}</td>
                            <td>{item.motivo || "—"}</td>
                            <td>{item.destinatario || "—"}</td>
                            <td>{item.registradoPor}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>


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
                        {erroDescartes || !complementoAtual ||
                        carregandoDescartes
                          ? "—"
                          : perdasConfirmadas}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Custo de insumos
                        consumidos (toda a cozinha)
                      </span>

                      <strong>
                        {erroCustos || !consumosAtuais ||
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
                  ) : carregandoCustos || !consumosAtuais ? (
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
                    O descarte considera a data em que a perda foi registrada, mesmo que a feira de origem seja anterior ao período. Sobras podem
                    ser reaproveitadas. O
                    custo mostrado
                    considera apenas
                    insumos consumidos,
                    sem mão de obra e
                    outras despesas; não
                    é custo por feira e não muda com o filtro de feira.
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
                      Ordens pela data de produção, independentemente do filtro de feira. Custos acumulados até a consulta.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      !complementoAtual ||
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
                  (carregandoOrdens || !complementoAtual) && (
                    <p role="status">
                      Carregando ordens de
                      massa...
                    </p>
                  )}

                {!erroOrdens &&
                  !carregandoOrdens && complementoAtual && (
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
                        custos consideram todos os consumos registrados na ordem, inclusive fora do período selecionado, até esta consulta. Não incluem mão de obra nem outras despesas; “—” indica
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
                    ingrediente e lote, atualizado pelo inventário. O CSV registra o horário de exportação, não um fechamento contábil mensal.
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
                      Valor estimado deste estoque: {estoqueSemCusto ? "indisponível — há lotes sem custo válido" : formatCurrency(valorEstoque)}.
                      As quantidades têm
                      unidades diferentes;
                      por isso não há soma
                      geral de kg, litros e
                      unidades.
                    </p>
                  </>
                )}
            </section>
              </div>
            </details>
          </>
        )}
      </div>
    </AppLayout>
  );
}


export default function RelatoriosPage() {
  const { usuario } = useAuth();
  return <RelatoriosConteudo key={usuario?.id ?? "sem-sessao"} />;
}
