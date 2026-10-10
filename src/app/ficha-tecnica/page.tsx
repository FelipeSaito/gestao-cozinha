"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  CATEGORIAS_FICHA, UNIDADES_FICHA, calcularCustoFicha, validarFichaTecnica,
  type DadosFichaTecnica, type FichaTecnica, type UnidadeFicha,
} from "@/lib/fichas-tecnicas";
import { listarFichasTecnicas, salvarFichaTecnica } from "@/services/fichasTecnicas";
import styles from "./page.module.css";

const moeda = (valor: number | null) => valor === null ? "Não calculado" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Linha = { chave: string; nome: string; quantidade: string; unidade: UnidadeFicha; preco: string };
const novaLinha = (): Linha => ({ chave: crypto.randomUUID(), nome: "", quantidade: "", unidade: "kg", preco: "" });

function EditorFicha({ ficha, podeEditar, aoSalvar, aoFechar }: {
  ficha: FichaTecnica | null; podeEditar: boolean;
  aoSalvar: (ficha: FichaTecnica) => void; aoFechar: () => void;
}) {
  const [id] = useState(() => ficha?.id ?? crypto.randomUUID());
  const [editando, setEditando] = useState(!ficha);
  const [nome, setNome] = useState(ficha?.nome ?? "");
  const [categoria, setCategoria] = useState<DadosFichaTecnica["categoria"]>(ficha?.categoria ?? "Massa");
  const [rendimento, setRendimento] = useState(ficha ? String(ficha.rendimento) : "");
  const [unidadeRendimento, setUnidadeRendimento] = useState<UnidadeFicha>(ficha?.unidadeRendimento ?? "kg");
  const [preparo, setPreparo] = useState(ficha?.modoPreparo ?? "");
  const [observacoes, setObservacoes] = useState(ficha?.observacoes ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(() => ficha ? ficha.ingredientes.map((item) => ({
    chave: crypto.randomUUID(), nome: item.nome, quantidade: String(item.quantidade), unidade: item.unidade,
    preco: item.custoUnitario === null ? "" : String(item.custoUnitario),
  })) : [novaLinha()]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const trava = useRef(false);
  const ativo = useRef(true);
  useEffect(() => { ativo.current = true; return () => { ativo.current = false; }; }, []);
  const leitura = !editando || !podeEditar;
  const ingredientes = linhas.map((item) => ({ nome: item.nome, quantidade: Number(item.quantidade), unidade: item.unidade,
    custoUnitario: item.preco.trim() === "" ? null : Number(item.preco) }));
  const numerosValidos = linhas.every((item) => item.quantidade.trim() !== "" && Number.isFinite(Number(item.quantidade)) && Number(item.quantidade) > 0 &&
    (item.preco.trim() === "" || (Number.isFinite(Number(item.preco)) && Number(item.preco) >= 0)));
  const custo = calcularCustoFicha({ ingredientes, rendimento: Number(rendimento) });
  function alterar(chave: string, mudanca: Partial<Linha>) {
    setLinhas((atual) => atual.map((item) => item.chave === chave ? { ...item, ...mudanca } : item));
  }
  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (leitura || trava.current) return;
    setErro(null);
    let dados: DadosFichaTecnica;
    try { dados = validarFichaTecnica({ nome, categoria, rendimento: Number(rendimento), unidadeRendimento, ingredientes, modoPreparo: preparo, observacoes }); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : "Confira os campos."); return; }
    trava.current = true;
    setSalvando(true);
    try {
      const salva = await salvarFichaTecnica(id, dados, ficha?.versao);
      if (ativo.current) aoSalvar(salva);
    } catch (falha) {
      if (ativo.current) setErro(falha instanceof Error ? falha.message : "Não foi possível salvar.");
    } finally {
      trava.current = false;
      if (ativo.current) setSalvando(false);
    }
  }
  function fechar() {
    if (trava.current) return;
    if (editando && !window.confirm("Sair da edição e descartar as alterações não salvas?")) return;
    aoFechar();
  }
  return <section className={styles.panel} aria-label="Detalhes da ficha">
    <div className={styles.heading}>
      <h2>{ficha ? (editando ? "Editar ficha técnica" : ficha.nome) : "Nova ficha técnica"}</h2>
      <button type="button" className={styles.secondary} onClick={fechar} disabled={salvando}>Fechar ficha</button>
    </div>
    {ficha && <p className={styles.muted}>Versão {ficha.versao} · Atualizada por {ficha.atualizadoPor} em {new Date(ficha.atualizadoEm).toLocaleString("pt-BR")}</p>}
    <form onSubmit={salvar} aria-busy={salvando}>
      <fieldset disabled={leitura || salvando} className={styles.fields}>
        <div className={styles.grid}>
          <label>Nome da receita<input required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label>Categoria<select value={categoria} onChange={(e) => setCategoria(e.target.value as DadosFichaTecnica["categoria"])}>{CATEGORIAS_FICHA.map((valor) => <option key={valor}>{valor}</option>)}</select></label>
          <label>Rendimento da receita<input required type="number" min="0.001" max="1000000" step="0.001" value={rendimento} onChange={(e) => setRendimento(e.target.value)} /></label>
          <label>Unidade do rendimento<select value={unidadeRendimento} onChange={(e) => setUnidadeRendimento(e.target.value as UnidadeFicha)}>{UNIDADES_FICHA.map((valor) => <option key={valor}>{valor}</option>)}</select></label>
        </div>
        <h3>Ingredientes</h3>
        <p className={styles.muted}>Informe o preço de 1 unidade selecionada na linha. Exemplo: farinha em kg usa preço por kg; em g usa preço por g. Preço vazio significa custo desconhecido.</p>
        <div className={styles.ingredients}>
          {linhas.map((item, indice) => <div key={item.chave} className={styles.ingredient}>
            <label>Ingrediente {indice + 1}<input required maxLength={120} value={item.nome} onChange={(e) => alterar(item.chave, { nome: e.target.value })} /></label>
            <label>Quantidade<input required type="number" min="0.001" max="1000000" step="0.001" value={item.quantidade} onChange={(e) => alterar(item.chave, { quantidade: e.target.value })} /></label>
            <label>Unidade<select value={item.unidade} onChange={(e) => alterar(item.chave, { unidade: e.target.value as UnidadeFicha, preco: "" })}>{UNIDADES_FICHA.map((valor) => <option key={valor}>{valor}</option>)}</select></label>
            <label>Preço por {item.unidade} (R$)<input type="number" min="0" max="1000000" step="0.0001" placeholder="Não informado" value={item.preco} onChange={(e) => alterar(item.chave, { preco: e.target.value })} /></label>
            {!leitura && <button type="button" className={styles.secondary} disabled={linhas.length <= 1} aria-label={`Remover ingrediente ${indice + 1}`} onClick={() => setLinhas((atual) => atual.filter((linha) => linha.chave !== item.chave))}>Remover</button>}
          </div>)}
        </div>
        {!leitura && <button type="button" className={styles.secondary} disabled={linhas.length >= 60} onClick={() => setLinhas((atual) => [...atual, novaLinha()])}>Adicionar ingrediente</button>}
        <label>Modo de preparo<textarea required rows={7} maxLength={10000} value={preparo} onChange={(e) => setPreparo(e.target.value)} /></label>
        <label>Observações (opcional)<textarea rows={3} maxLength={2000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} /></label>
      </fieldset>
      <div className={styles.costs} aria-live="polite">
        <div><span>Custo dos ingredientes</span><strong>{moeda(numerosValidos ? custo.custoTotal : null)}</strong></div>
        <div><span>Custo por {unidadeRendimento} de rendimento</span><strong>{moeda(numerosValidos ? custo.custoPorUnidade : null)}</strong></div>
      </div>
      {custo.semPreco > 0 && <p className={styles.notice}>Custo incompleto: {custo.semPreco} ingrediente(s) sem preço. Subtotal conhecido: {moeda(numerosValidos ? custo.subtotal : null)}.</p>}
      <p className={styles.muted}>Estimativa com os preços informados nesta ficha. Não inclui mão de obra, energia ou embalagem, salvo se cadastradas como itens. Salvar não altera o estoque.</p>
      {erro && <p className={styles.error} role="alert">{erro}</p>}
      {podeEditar && <div className={styles.actions}>{leitura ?
        <button type="button" className={styles.primary} onClick={() => setEditando(true)}>Editar ficha</button> :
        <button type="submit" className={styles.primary} disabled={salvando}>{salvando ? "Salvando..." : "Salvar ficha técnica"}</button>
      }</div>}
    </form>
  </section>;
}

function ConteudoFichas({ podeEditar }: { podeEditar: boolean }) {
  const [fichas, setFichas] = useState<FichaTecnica[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [consulta, setConsulta] = useState(0);
  const [selecionada, setSelecionada] = useState<FichaTecnica | "nova" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void listarFichasTecnicas(controller.signal).then((dados) => {
      if (!controller.signal.aborted) { setFichas(dados); setErro(null); }
    }).catch((falha: unknown) => {
      if (!controller.signal.aborted) setErro(falha instanceof Error ? falha.message : "Não foi possível carregar.");
    }).finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [consulta]);
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return fichas.filter((item) => `${item.nome} ${item.categoria}`.toLocaleLowerCase("pt-BR").includes(termo));
  }, [busca, fichas]);
  function salva(ficha: FichaTecnica) {
    setFichas((atual) => [...atual.filter((item) => item.id !== ficha.id), ficha].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    setSelecionada(null);
    setAviso(`Ficha “${ficha.nome}” salva com sucesso.`);
  }
  return <div className={styles.layout}>
    <div className={styles.heading}>
      <p className={styles.muted}>Receitas, rendimento e custos dos ingredientes.</p>
      {podeEditar && <button className={styles.primary} type="button" disabled={carregando || selecionada !== null} onClick={() => { setSelecionada("nova"); setAviso(null); }}>Nova ficha técnica</button>}
    </div>
    {aviso && <p className={styles.notice} role="status">{aviso}</p>}
    {selecionada !== null ? <EditorFicha key={selecionada === "nova" ? "nova" : `${selecionada.id}-${selecionada.versao}`} ficha={selecionada === "nova" ? null : selecionada} podeEditar={podeEditar} aoSalvar={salva} aoFechar={() => setSelecionada(null)} /> : <>
      <div className={styles.toolbar}>
        <label>Buscar receita ou categoria<input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Massa de pastel" /></label>
        <button type="button" className={styles.secondary} disabled={carregando} onClick={() => { setCarregando(true); setConsulta((valor) => valor + 1); }}>Atualizar lista</button>
      </div>
      {erro && <p className={styles.error} role="alert">{erro}</p>}
      {carregando ? <p role="status">Carregando fichas...</p> : <div className={styles.cards}>
        {filtradas.map((ficha) => <article className={styles.panel} key={ficha.id}>
          <span className={styles.tag}>{ficha.categoria}</span><h2>{ficha.nome}</h2>
          <p>Rendimento: <strong>{ficha.rendimento.toLocaleString("pt-BR")} {ficha.unidadeRendimento}</strong></p>
          <p>{ficha.ingredientes.length} ingrediente(s)</p>
          <p>Custo dos ingredientes: <strong>{moeda(calcularCustoFicha(ficha).custoTotal)}</strong></p>
          <button type="button" className={styles.secondary} onClick={() => { setSelecionada(ficha); setAviso(null); }}>Ver ficha técnica</button>
        </article>)}
        {filtradas.length === 0 && !erro && <p>{fichas.length ? "Nenhuma ficha corresponde à busca." : "Nenhuma ficha técnica cadastrada."}</p>}
      </div>}
    </>}
  </div>;
}
export default function FichaTecnicaPage() {
  const { usuario, podeAcessar } = useAuth();
  const permitido = Boolean(usuario && podeAcessar("/ficha-tecnica"));
  const podeEditar = Boolean(usuario?.perfis.some((perfil) => perfil === "dono" || perfil === "administracao"));
  return <AppLayout title="Ficha técnica" subtitle="Padronize receitas e acompanhe o custo dos ingredientes">
    {permitido && usuario && <ConteudoFichas key={`${usuario.id}-${podeEditar}`} podeEditar={podeEditar} />}
  </AppLayout>;
}