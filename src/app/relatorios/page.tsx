"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, Filter } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useInventory } from "@/contexts/InventoryContext";
import type { Product } from "@/types";
import { chaveSabor, nomeSabor } from "@/lib/nomesSabores";
import { useFeirasCadastradas } from "@/services/useFeirasCadastradas";
import { escutarPlanejamentos, type Planejamentos } from "@/services/planejamentosFirestore";
import { escutarSaidas, type Saidas } from "@/services/saidasFirestore";
import { escutarFechamentos, type Retornos } from "@/services/fechamentosFirestore";
import { listarOrdens, type OrdemRemota } from "@/services/ordensProducao";
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

function saboresDaFeira(chave: string, planos: Planejamentos, saidas: Saidas, retornos: Retornos): LinhaSabor[] {
  const mapa = new Map<string, LinhaSabor>();
  function linha(nome: string, id: string) {
    const chaveSabor = normalizar(nome) || id;
    const atual = mapa.get(chaveSabor);
    if (atual) return atual;
    const nova: LinhaSabor = { id: chaveSabor, nome: nomeSabor(nome), planejados: null, separados: null, sobras: null };
    mapa.set(chaveSabor, nova);
    return nova;
  }
  for (const item of planos[chave] ?? []) {
    const atual = linha(item.nome, item.id);
    atual.planejados = (atual.planejados ?? 0) + item.quantidade;
  }
  for (const item of saidas[chave]?.itens ?? []) {
    const atual = linha(item.nome, item.saborId);
    atual.separados = (atual.separados ?? 0) + item.separado;
  }
  for (const item of retornos[chave]?.itens ?? []) {
    const atual = linha(item.nome, item.saborId);
    atual.sobras = (atual.sobras ?? 0) + item.sobraram;
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const campo = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value;
  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}

function diasAtras(iso: string, dias: number) {
  const data = new Date(`${iso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

function csvCampo(valor: string | number | null) {
  // Aspas protegem separadores; o prefixo protege contra fórmulas no Excel.
  const texto = valor === null ? "" : String(valor);
  const seguro = /^[\s]*[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

export default function RelatoriosPage() {
  const { usuario } = useAuth();
  const [fim, setFim] = useState(hojeBrasil);
  const [inicio, setInicio] = useState(() => diasAtras(hojeBrasil(), 29));
  const [feiraId, setFeiraId] = useState("");
  const [localEstoque, setLocalEstoque] = useState<"principal" | "cozinha">("principal");
  const [detalheAberto, setDetalheAberto] = useState<string | null>(null);
  const [planos, setPlanos] = useState<Planejamentos>({});
  const [saidas, setSaidas] = useState<Saidas>({});
  const [retornos, setRetornos] = useState<Retornos>({});
  const [ordens, setOrdens] = useState<OrdemRemota[]>([]);
  const [carregandoOrdens, setCarregandoOrdens] = useState(true);
  const [erroOrdens, setErroOrdens] = useState("");
  const [carregados, setCarregados] = useState({ planos: false, saidas: false, retornos: false });
  const [erros, setErros] = useState({ planos: "", saidas: "", retornos: "" });
  const { feirasCadastradas, erroFeirasCadastradas } = useFeirasCadastradas(usuario?.id);
  const {
    produtos: estoquePrincipal,
    estoqueCozinha,
    carregando: carregandoEstoque,
    erro: erroEstoque,
  } = useInventory();
  const dono = Boolean(usuario?.perfis?.includes("dono") || usuario?.perfil === "dono");

  useEffect(() => {
    if (!usuario || !dono) return;
    const pararPlanos = escutarPlanejamentos(
      (dados) => { setPlanos(dados); setCarregados((atual) => ({ ...atual, planos: true })); setErros((atual) => ({ ...atual, planos: "" })); },
      (erro) => { setErros((atual) => ({ ...atual, planos: erro.message })); setCarregados((atual) => ({ ...atual, planos: false })); },
    );
    const pararSaidas = escutarSaidas(
      (dados) => { setSaidas(dados); setCarregados((atual) => ({ ...atual, saidas: true })); setErros((atual) => ({ ...atual, saidas: "" })); },
      (erro) => { setErros((atual) => ({ ...atual, saidas: erro.message })); setCarregados((atual) => ({ ...atual, saidas: false })); },
    );
    const pararRetornos = escutarFechamentos(
      (dados) => { setRetornos(dados); setCarregados((atual) => ({ ...atual, retornos: true })); setErros((atual) => ({ ...atual, retornos: "" })); },
      (erro) => { setErros((atual) => ({ ...atual, retornos: erro.message })); setCarregados((atual) => ({ ...atual, retornos: false })); },
    );
    return () => { pararPlanos(); pararSaidas(); pararRetornos(); };
  }, [usuario?.id, dono]);

  useEffect(() => {
    if (!usuario || !dono) return;
    let ativo = true;
    setCarregandoOrdens(true);
    void listarOrdens().then((dados) => {
      if (ativo) { setOrdens(dados); setErroOrdens(""); }
    }).catch((falha: unknown) => {
      if (ativo) setErroOrdens(falha instanceof Error ? falha.message : "Não foi possível carregar as ordens de massa.");
    }).finally(() => {
      if (ativo) setCarregandoOrdens(false);
    });
    return () => { ativo = false; };
  }, [usuario?.id, dono]);

  const linhas = useMemo<Linha[]>(() => {
    const chaves = new Set([...Object.keys(planos), ...Object.keys(saidas), ...Object.keys(retornos)]);
    return [...chaves].map((chave) => {
      const separador = chave.indexOf(":");
      const data = chave.slice(0, separador);
      const id = chave.slice(separador + 1);
      const feira = feirasCadastradas.find((item) => item.id === id);
      return {
        chave, data, feiraId: id, feira: feira?.nome ?? id,
        responsaveis: feira?.responsaveis.join(", ") ?? "—",
        planejados: (planos[chave] ?? []).reduce((total, item) => total + item.quantidade, 0),
        separados: saidas[chave] ? saidas[chave].itens.reduce((total, item) => total + item.separado, 0) : null,
        sobras: retornos[chave] ? retornos[chave].itens.reduce((total, item) => total + item.sobraram, 0) : null,
      };
    }).filter((linha) => linha.data >= inicio && linha.data <= fim && (!feiraId || linha.feiraId === feiraId))
      .sort((a, b) => b.data.localeCompare(a.data) || a.feira.localeCompare(b.feira, "pt-BR"));
  }, [planos, saidas, retornos, feirasCadastradas, inicio, fim, feiraId]);
  const totais = useMemo(() => ({
    planejados: linhas.reduce((soma, linha) => soma + linha.planejados, 0),
    separados: linhas.reduce((soma, linha) => soma + (linha.separados ?? 0), 0),
    sobras: linhas.reduce((soma, linha) => soma + (linha.sobras ?? 0), 0),
  }), [linhas]);
  const ordensMassa = useMemo(() => ordens.filter((ordem) =>
    normalizar(ordem.prato) === "massa de pastel" &&
    normalizar(ordem.unidade) === "kg" &&
    ordem.dataProducao >= inicio && ordem.dataProducao <= fim,
  ).sort((a, b) => b.dataProducao.localeCompare(a.dataProducao)), [ordens, inicio, fim]);
  const kgPlanejados = ordensMassa.reduce((soma, ordem) => soma + ordem.quantidade, 0);
  const kgConcluidos = ordensMassa.filter((ordem) => ordem.status === "concluida")
    .reduce((soma, ordem) => soma + ordem.quantidade, 0);
  const itensEstoque: Product[] = localEstoque === "principal" ? estoquePrincipal : estoqueCozinha;
  const itensOrdenados = [...itensEstoque].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR") || a.lote.localeCompare(b.lote, "pt-BR"));
  const lotesVencidos = itensEstoque.filter((item) => item.situacao === "vencido").length;
  const lotesBaixos = itensEstoque.filter((item) => item.situacao === "estoque-baixo").length;
  const carregando = !carregados.planos || !carregados.saidas || !carregados.retornos;
  const erro = [erros.planos, erros.saidas, erros.retornos, erroFeirasCadastradas].filter(Boolean).join(" ");
  const periodoInvalido = !inicio || !fim || inicio > fim;
  const podeMostrar = dono && !carregando && !erro && !periodoInvalido;

  function exportar() {
    if (!podeMostrar || !linhas.length) return;
    const cabecalho = ["Data", "Feira", "Responsáveis", "Planejados", "Separados", "Sobras"];
    const valores = linhas.map((linha) => [linha.data, linha.feira, linha.responsaveis,
      linha.planejados, linha.separados, linha.sobras]);
    const csv = "\uFEFF" + [cabecalho, ...valores].map((campos) => campos.map(csvCampo).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `feiras-${inicio}-a-${fim}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarSabores() {
    if (!podeMostrar || !linhas.length) return;
    const cabecalho = ["Data", "Feira", "Responsáveis", "Sabor", "Planejados", "Separados", "Sobras"];
    const valores = linhas.flatMap((feira) => saboresDaFeira(feira.chave, planos, saidas, retornos)
      .map((sabor) => [feira.data, feira.feira, feira.responsaveis, sabor.nome,
        sabor.planejados, sabor.separados, sabor.sobras]));
    const csv = "\uFEFF" + [cabecalho, ...valores].map((campos) => campos.map(csvCampo).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sabores-feiras-${inicio}-a-${fim}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarMassa() {
    if (!dono || carregandoOrdens || erroOrdens || periodoInvalido || !ordensMassa.length) return;
    const cabecalho = ["Data", "Código", "Responsável", "Quantidade kg", "Situação"];
    const valores = ordensMassa.map((ordem) => [ordem.dataProducao, ordem.codigo,
      ordem.responsavel, ordem.quantidade, ordem.status]);
    const csv = "\uFEFF" + [cabecalho, ...valores].map((campos) => campos.map(csvCampo).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `massa-${inicio}-a-${fim}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarEstoque() {
    if (!dono || carregandoEstoque || erroEstoque || !itensOrdenados.length) return;
    const cabecalho = ["Local", "Ingrediente", "Lote", "Validade", "Quantidade", "Unidade", "Situação"];
    const valores = itensOrdenados.map((item) => [localEstoque === "principal" ? "Principal" : "Cozinha",
      item.nome, item.lote, item.validade, item.quantidade, item.unidade, item.situacao]);
    const csv = "\uFEFF" + [cabecalho, ...valores].map((campos) => campos.map(csvCampo).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `estoque-${localEstoque}-${hojeBrasil()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <AppLayout title="Relatórios" subtitle="Acompanhe os registros reais das feiras."
      headerActions={dono ? <Button type="button" variant="secondary" leftIcon={<Download size={18} />}
        disabled={!podeMostrar || linhas.length === 0} onClick={exportar}>Exportar CSV</Button> : undefined}>
      <div className={styles.page}>
        {!dono ? <p role="alert">Somente o Dono pode consultar este relatório.</p> : <>
          <section className={styles.panel} aria-labelledby="filtros-feiras">
            <div className={styles.heading}><div><h2 id="filtros-feiras">Relatório de feiras</h2>
              <p>Planejamento, saída conferida e sobras registradas por feira.</p></div><Filter size={22} aria-hidden="true" /></div>
            <div className={styles.filters}>
              <label>De<input type="date" value={inicio} onChange={(evento) => setInicio(evento.target.value)} /></label>
              <label>Até<input type="date" value={fim} onChange={(evento) => setFim(evento.target.value)} /></label>
              <label>Feira<select value={feiraId} onChange={(evento) => setFeiraId(evento.target.value)}>
                <option value="">Todas as feiras</option>
                {feirasCadastradas.map((feira) => <option value={feira.id} key={feira.id}>{feira.nome}</option>)}
              </select></label>
            </div>
            {periodoInvalido && <p role="alert" className={styles.error}>Escolha um período válido.</p>}
          </section>
          {erro && <p role="alert" className={styles.error}>{erro}</p>}
          {!erro && carregando && <p role="status">Carregando dados do Firestore...</p>}
          {podeMostrar && <>
            <section className={styles.metrics} aria-label="Totais do período">
              <div><span>Feiras com registros</span><strong>{linhas.length}</strong></div>
              <div><span>Pastéis planejados</span><strong>{totais.planejados}</strong></div>
              <div><span>Saídas conferidas</span><strong>{totais.separados}</strong></div>
              <div><span>Sobras registradas</span><strong>{totais.sobras}</strong></div>
            </section>
            <section className={styles.panel} aria-labelledby="registros-feiras">
              <div className={styles.heading}>
                <h2 id="registros-feiras">Feiras no período</h2>
                <Button type="button" variant="secondary" disabled={!linhas.length} onClick={exportarSabores}>
                  Exportar sabores CSV
                </Button>
              </div>
              {linhas.length === 0 ? <p>Nenhum registro encontrado para este período.</p> :
                <div className={styles.tableScroll} role="region" aria-label="Registros de feiras" tabIndex={0}>
                  <table className={styles.table}><thead><tr>
                    <th scope="col">Data</th><th scope="col">Feira</th><th scope="col">Responsáveis</th>
                    <th scope="col">Planejados</th><th scope="col">Separados</th><th scope="col">Sobras</th><th scope="col">Detalhes</th>
                  </tr></thead><tbody>{linhas.map((linha) => {
                    const aberta = detalheAberto === linha.chave;
                    const sabores = saboresDaFeira(linha.chave, planos, saidas, retornos);
                    return <Fragment key={linha.chave}><tr>
                      <td>{linha.data.split("-").reverse().join("/")}</td><th scope="row">{linha.feira}</th>
                      <td>{linha.responsaveis}</td><td>{linha.planejados}</td>
                      <td>{linha.separados ?? "—"}</td><td>{linha.sobras ?? "—"}</td>
                      <td>
                        <button type="button" className={styles.detailButton}
                          aria-expanded={aberta} aria-controls={`sabores-${linha.chave}`}
                          onClick={() => setDetalheAberto(aberta ? null : linha.chave)}>
                          {aberta ? "Ocultar" : "Ver sabores"}
                        </button>
                      </td>
                    </tr>
                    {aberta && <tr><td colSpan={7} id={`sabores-${linha.chave}`}>
                      <div className={styles.detail}>
                        <strong>Sabores de {linha.feira}</strong>
                        {sabores.length === 0 ? <p>Nenhum sabor registrado.</p> :
                          <ul>{sabores.map((sabor) => <li key={sabor.id}>
                            <span>{sabor.nome}</span>
                            <span>Previstos: {sabor.planejados ?? "—"}</span>
                            <span>Separados: {sabor.separados ?? "—"}</span>
                            <span>Sobras: {sabor.sobras ?? "—"}</span>
                          </li>)}</ul>}
                      </div>
                    </td></tr>}
                    </Fragment>;
                  })}</tbody></table>
                </div>}
              <p className={styles.note}>“—” indica que não há conferência ou fechamento salvo. Os totais de saída e sobras somam apenas registros existentes.</p>
            </section>
          </>}
          {!periodoInvalido && <section className={styles.panel} aria-labelledby="relatorio-massa">
            <div className={styles.heading}>
              <div><h2 id="relatorio-massa">Produção de massa</h2>
                <p>Ordens de massa de pastel em kg no período selecionado.</p></div>
              <Button type="button" variant="secondary" disabled={carregandoOrdens || Boolean(erroOrdens) || !ordensMassa.length}
                onClick={exportarMassa}>Exportar massa CSV</Button>
            </div>
            {erroOrdens && <p role="alert" className={styles.error}>{erroOrdens}</p>}
            {!erroOrdens && carregandoOrdens && <p role="status">Carregando ordens de massa...</p>}
            {!erroOrdens && !carregandoOrdens && <>
              <div className={styles.massSummary}>
                <div><span>Ordens</span><strong>{ordensMassa.length}</strong></div>
                <div><span>Kg planejados</span><strong>{kgPlanejados}</strong></div>
                <div><span>Kg de ordens concluídas</span><strong>{kgConcluidos}</strong></div>
              </div>
              {ordensMassa.length === 0 ? <p>Nenhuma ordem de massa neste período.</p> :
                <div className={styles.tableScroll} role="region" aria-label="Ordens de massa" tabIndex={0}>
                  <table className={styles.table}><thead><tr>
                    <th scope="col">Data</th><th scope="col">Código</th><th scope="col">Responsável</th>
                    <th scope="col">Situação</th><th scope="col">Quantidade</th>
                  </tr></thead><tbody>{ordensMassa.map((ordem) => <tr key={ordem.id}>
                    <td>{ordem.dataProducao.split("-").reverse().join("/")}</td>
                    <th scope="row">{ordem.codigo}</th><td>{ordem.responsavel}</td>
                    <td>{ordem.status === "concluida" ? "Concluída" :
                      ordem.status === "em-andamento" ? "Em andamento" : "Planejada"}</td>
                    <td>{ordem.quantidade} kg</td>
                  </tr>)}</tbody></table>
                </div>}
              <p className={styles.note}>Os kg concluídos somam ordens marcadas como concluídas; não representam o saldo atual dos freezers.</p>
            </>}
          </section>}
          <section className={styles.panel} aria-labelledby="relatorio-estoque">
            <div className={styles.heading}>
              <div><h2 id="relatorio-estoque">Estoque atual</h2>
                <p>Saldo atual por ingrediente e lote. Este painel não usa o filtro de período acima.</p></div>
              <Button type="button" variant="secondary"
                disabled={carregandoEstoque || Boolean(erroEstoque) || !itensOrdenados.length}
                onClick={exportarEstoque}>Exportar estoque CSV</Button>
            </div>
            <label className={styles.stockSelector}>Local do estoque
              <select value={localEstoque} onChange={(evento) =>
                setLocalEstoque(evento.target.value as "principal" | "cozinha")}>
                <option value="principal">Estoque principal</option>
                <option value="cozinha">Estoque da cozinha</option>
              </select>
            </label>
            {erroEstoque && <p role="alert" className={styles.error}>{erroEstoque}</p>}
            {!erroEstoque && carregandoEstoque && <p role="status">Carregando estoque...</p>}
            {!erroEstoque && !carregandoEstoque && <>
              <div className={styles.massSummary}>
                <div><span>Lotes cadastrados</span><strong>{itensEstoque.length}</strong></div>
                <div><span>Estoque baixo</span><strong>{lotesBaixos}</strong></div>
                <div><span>Lotes vencidos</span><strong>{lotesVencidos}</strong></div>
              </div>
              {itensOrdenados.length === 0 ? <p>Nenhum ingrediente neste estoque.</p> :
                <div className={styles.tableScroll} role="region" aria-label="Ingredientes do estoque" tabIndex={0}>
                  <table className={styles.table}><thead><tr>
                    <th scope="col">Ingrediente</th><th scope="col">Lote</th><th scope="col">Validade</th>
                    <th scope="col">Situação</th><th scope="col">Quantidade</th>
                  </tr></thead><tbody>{itensOrdenados.map((item) => <tr key={item.id}>
                    <th scope="row">{item.nome}</th><td>{item.lote}</td>
                    <td>{item.validade.split("-").reverse().join("/")}</td>
                    <td>{item.situacao.replaceAll("-", " ")}</td>
                    <td>{item.quantidade} {item.unidade}</td>
                  </tr>)}</tbody></table>
                </div>}
              <p className={styles.note}>As quantidades têm unidades diferentes; por isso não há soma geral de kg, litros e unidades.</p>
            </>}
          </section>
        </>}
      </div>
    </AppLayout>
  );
}
