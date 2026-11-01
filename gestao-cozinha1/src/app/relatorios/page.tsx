"use client";

import { useState } from "react";
import { BarChart3, CheckCircle2, Download, Filter, ShieldCheck, ClipboardList, TriangleAlert } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usuarioEstoque } from "@/services/usuarios";
import styles from "./page.module.css";

type Registro = { id: string; data: string; setor: "Cozinha" | "Bar"; tipo: "Produção" | "Transferência" | "Entrada" | "Saída"; descricao: string; quantidade: number; unidade: string; situacao: "Planejada" | "Em preparo" | "Concluída" | "Confirmada" | "Com divergência" };
const registros: Registro[] = [
  { id: "DEMO-001", data: "2026-09-14", setor: "Cozinha", tipo: "Produção", descricao: "Pastel de carne", quantidade: 120, unidade: "unidades", situacao: "Concluída" },
  { id: "DEMO-002", data: "2026-09-15", setor: "Cozinha", tipo: "Transferência", descricao: "Recebimento de carne moída", quantidade: 5, unidade: "kg", situacao: "Confirmada" },
  { id: "DEMO-003", data: "2026-09-16", setor: "Bar", tipo: "Entrada", descricao: "Coca-Cola lata 350 ml", quantidade: 36, unidade: "unidades", situacao: "Confirmada" },
  { id: "DEMO-004", data: "2026-09-17", setor: "Cozinha", tipo: "Produção", descricao: "Pastel de queijo", quantidade: 80, unidade: "unidades", situacao: "Em preparo" },
  { id: "DEMO-005", data: "2026-09-18", setor: "Cozinha", tipo: "Transferência", descricao: "Muçarela: recebimento com diferença", quantidade: 3, unidade: "kg", situacao: "Com divergência" },
  { id: "DEMO-006", data: "2026-09-18", setor: "Bar", tipo: "Saída", descricao: "Água mineral 500 ml", quantidade: 12, unidade: "unidades", situacao: "Confirmada" },
  { id: "DEMO-007", data: "2026-09-19", setor: "Cozinha", tipo: "Produção", descricao: "Recheio de frango", quantidade: 8, unidade: "kg", situacao: "Planejada" },
  { id: "DEMO-008", data: "2026-09-19", setor: "Cozinha", tipo: "Produção", descricao: "Pastel de pizza", quantidade: 60, unidade: "unidades", situacao: "Concluída" },
];
const iniciais = { inicio: "2026-09-14", fim: "2026-09-19", setor: "Todos" };
const formatarData = (valor: string) => valor.split("-").reverse().join("/");
export default function RelatoriosPage() {
  const [inicio, setInicio] = useState(iniciais.inicio);
  const [fim, setFim] = useState(iniciais.fim);
  const [setor, setSetor] = useState(iniciais.setor);
  const [feedback, setFeedback] = useState("");
  const erro = !inicio || !fim ? "Preencha as duas datas para consultar o período." : inicio > fim ? "A data final deve ser igual ou posterior à inicial." : "";
  const filtrados = erro ? [] : registros.filter((r) => r.data >= inicio && r.data <= fim && (setor === "Todos" || r.setor === setor));
  const producoes = filtrados.filter((r) => r.tipo === "Produção");
  const concluidas = producoes.filter((r) => r.situacao === "Concluída").length;
  const divergencias = filtrados.filter((r) => r.situacao === "Com divergência").length;
  const distribuicao = ["Produção", "Transferência", "Entrada", "Saída"].map((tipo) => ({ tipo, total: filtrados.filter((r) => r.tipo === tipo).length }));
  const maior = Math.max(1, ...distribuicao.map((d) => d.total));
  function limpar() { setInicio(iniciais.inicio); setFim(iniciais.fim); setSetor(iniciais.setor); setFeedback(""); }
  function exportar() {
    if (erro || !filtrados.length) return;
    const linhas = [["Código", "Data", "Setor", "Tipo", "Descrição", "Quantidade", "Unidade", "Situação"], ...filtrados.map((r) => [r.id, formatarData(r.data), r.setor, r.tipo, r.descricao, String(r.quantidade), r.unidade, r.situacao])];
    const csv = "\uFEFF" + linhas.map((linha) => linha.map((valor) => `"${valor.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `relatorio-demonstracao-${inicio}-${fim}.csv`; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback("Exportação dos dados de demonstração solicitada. Confira os downloads do navegador.");
  }
  return <AppLayout user={usuarioEstoque} title="Relatórios" subtitle="Uma visão geral para acompanhar a operação." headerActions={<Button variant="secondary" leftIcon={<Download size={20} />} disabled={Boolean(erro) || !filtrados.length} onClick={exportar}>Exportar CSV</Button>}>
    <div className={styles.page}>
      <div className={styles.access}><ShieldCheck size={24} aria-hidden="true" /><div><strong>Área destinada ao Chef e ao Dono</strong><p>Prévia do frontend. A restrição de acesso será conectada ao login; esta rota ainda não está protegida.</p></div></div>
      <p className={styles.demo}>Todos os números abaixo são fictícios, de 14 a 19/09/2026. Não representam os estoques ou as produções do seu sistema.</p>
      <div role="status" aria-live="polite">{feedback && <p className={styles.success}>{feedback}</p>}</div>
      <section className={styles.panel} aria-labelledby="filtros-relatorio"><div className={styles.sectionHeading}><div><h2 id="filtros-relatorio">Qual período você quer consultar?</h2><p>Os indicadores e registros mudam com os filtros.</p></div><Filter size={24} aria-hidden="true" /></div>
        <div className={styles.reportFilters}>
          <Input type="date" label="Data inicial" required value={inicio} max={fim || undefined} onChange={(e) => setInicio(e.target.value)} aria-describedby={erro ? "erro-periodo" : undefined} aria-invalid={Boolean(erro)} />
          <Input type="date" label="Data final" required value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} aria-describedby={erro ? "erro-periodo" : undefined} aria-invalid={Boolean(erro)} />
          <div className={styles.field}><label htmlFor="setor-relatorio">Setor</label><select id="setor-relatorio" className={styles.select} value={setor} onChange={(e) => setSetor(e.target.value)}><option>Todos</option><option>Cozinha</option><option>Bar</option></select></div>
          <Button variant="secondary" onClick={limpar}>Restaurar exemplo</Button>
        </div>
        {erro && <p id="erro-periodo" className={styles.error} role="alert">{erro}</p>}
      </section>
      <section className={styles.reportMetrics} aria-label="Indicadores do período">
        <div className={styles.metric}><ClipboardList aria-hidden="true" /><span>Registros no período</span><strong>{erro ? "—" : filtrados.length}</strong></div>
        <div className={styles.metric}><BarChart3 aria-hidden="true" /><span>Fichas de produção</span><strong>{erro ? "—" : producoes.length}</strong></div>
        <div className={styles.metric}><CheckCircle2 aria-hidden="true" /><span>Produções concluídas</span><strong>{erro ? "—" : concluidas}</strong></div>
        <div className={styles.metric}><TriangleAlert aria-hidden="true" /><span>Recebimentos com divergência</span><strong>{erro ? "—" : divergencias}</strong></div>
      </section>
      {!erro && <>
        <div className={styles.overview}>
          <section className={styles.panel} aria-labelledby="distribuicao"><h2 id="distribuicao">Registros por tipo</h2><p className={styles.muted}>Contagem de registros, não de unidades ou quilos.</p><ul className={styles.bars}>{distribuicao.map((d) => <li key={d.tipo}><div className={styles.barLabel}><span>{d.tipo}</span><strong>{d.total} registros</strong></div><div className={styles.track} aria-hidden="true"><span style={{ width: `${d.total / maior * 100}%` }} /></div></li>)}</ul></section>
          <section className={styles.panel} aria-labelledby="atencao"><h2 id="atencao">Pontos de atenção</h2><div className={divergencias ? styles.attention : styles.success}><TriangleAlert size={24} aria-hidden="true" /><p>{divergencias ? `${divergencias} recebimento(s) com divergência no período selecionado.` : "Nenhuma divergência nos registros selecionados."}</p></div><p className={styles.muted}>Veja os registros abaixo para identificar os itens. A análise detalhada de justificativas será integrada aos recebimentos reais.</p></section>
        </div>
        <section className={styles.panel} aria-labelledby="registros"><div className={styles.sectionHeading}><h2 id="registros">Registros do período</h2><span className={styles.muted} role="status">{filtrados.length} registros encontrados</span></div>
          <ul className={styles.records}>{filtrados.map((r) => <li className={styles.record} key={r.id}><div><span className={styles.muted}>{r.tipo} · {r.setor} · {formatarData(r.data)}</span><h3>{r.descricao}</h3><span className={styles.muted}>{r.id}</span></div><div className={styles.recordEnd}><strong>{r.quantidade} {r.unidade}</strong><span className={r.situacao === "Com divergência" ? styles.warn : r.situacao === "Concluída" || r.situacao === "Confirmada" ? styles.good : styles.neutral}>{r.situacao}</span></div></li>)}</ul>
          {!filtrados.length && <div className={styles.empty}><BarChart3 size={36} aria-hidden="true" /><h3>Nenhum registro neste período</h3><p>Experimente as datas do exemplo: 14 a 19/09/2026.</p><Button variant="secondary" onClick={limpar}>Restaurar exemplo</Button></div>}
        </section>
      </>}
    </div>
  </AppLayout>;
}
