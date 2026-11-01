"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Pencil, Plus, Search, Truck, UserRound, Package, Phone, ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usuarioEstoque } from "@/services/usuarios";
import styles from "./page.module.css";

type Fornecedor = { id: string; nome: string; documento: string; contato: string; telefone: string; produtos: string; ativo: boolean };
const exemplos: Fornecedor[] = [
  { id: "demo-1", nome: "Fornecedor de carnes · Exemplo", documento: "", contato: "Contato de demonstração", telefone: "", produtos: "Carne moída, frango e calabresa", ativo: true },
  { id: "demo-2", nome: "Distribuidora de bebidas · Exemplo", documento: "", contato: "Contato de demonstração", telefone: "", produtos: "Refrigerantes, água e sucos", ativo: true },
  { id: "demo-3", nome: "Fornecedor de laticínios · Exemplo", documento: "", contato: "", telefone: "", produtos: "Muçarela, requeijão e queijos", ativo: false },
];
const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const documentoChave = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

export default function FornecedoresPage() {
  const [lista, setLista] = useState<Fornecedor[]>(exemplos);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [edicao, setEdicao] = useState<Fornecedor | "novo" | null>(null);
  const [mensagem, setMensagem] = useState("");
  const cabecalhoRef = useRef<HTMLHeadingElement>(null);
  const voltarFoco = useRef(false);
  useEffect(() => {
    if (!edicao && voltarFoco.current) {
      cabecalhoRef.current?.focus();
      voltarFoco.current = false;
    }
  }, [edicao]);
  const termo = normalizar(busca);
  const visiveis = lista.filter((f) => {
    const corresponde = normalizar(`${f.nome} ${f.contato} ${f.produtos} ${f.documento}`).includes(termo) ||
      (documentoChave(busca).length > 0 && documentoChave(f.documento).includes(documentoChave(busca)));
    return corresponde && (filtro === "todos" || (filtro === "ativos" ? f.ativo : !f.ativo));
  });
  function abrir(f: Fornecedor | "novo") { setEdicao(f); setMensagem(""); }
  function fechar() { voltarFoco.current = true; setEdicao(null); }
  function salvar(f: Fornecedor) {
    setLista((atual) => atual.some((item) => item.id === f.id) ? atual.map((item) => item.id === f.id ? f : item) : [f, ...atual]);
    setBusca(""); setFiltro("todos"); setMensagem(`${f.nome}: cadastro atualizado nesta demonstração.`); fechar();
  }
  function alternar(f: Fornecedor) {
    setLista((atual) => atual.map((item) => item.id === f.id ? { ...item, ativo: !item.ativo } : item));
    setMensagem(`${f.nome} ${f.ativo ? "marcado como inativo" : "reativado"}.`);
  }
  return <AppLayout user={usuarioEstoque} title="Fornecedores" subtitle="Encontre quem fornece os ingredientes e bebidas." headerActions={!edicao ? <Button leftIcon={<Plus size={20} />} onClick={() => abrir("novo")}>Novo fornecedor</Button> : undefined}>
    <div className={styles.page}>
      <p className={styles.demo}>Demonstração do frontend: os cadastros são exemplos e as alterações reiniciam ao sair da página ou recarregar.</p>
      <div role="status" aria-live="polite" aria-atomic="true">{mensagem && <p className={styles.success}><CheckCircle2 size={22} aria-hidden="true" />{mensagem}</p>}</div>
      {edicao ? <FornecedorForm key={typeof edicao === "string" ? "novo" : edicao.id} inicial={edicao === "novo" ? undefined : edicao} lista={lista} onSave={salvar} onCancel={fechar} /> : <>
        <section className={styles.metrics} aria-label="Resumo de fornecedores">
          <div className={styles.metric}><Truck aria-hidden="true" /><span>Cadastrados</span><strong>{lista.length}</strong></div>
          <div className={styles.metric}><CheckCircle2 aria-hidden="true" /><span>Ativos</span><strong>{lista.filter((f) => f.ativo).length}</strong></div>
          <div className={styles.metric}><Package aria-hidden="true" /><span>Inativos</span><strong>{lista.filter((f) => !f.ativo).length}</strong></div>
        </section>
        <section className={styles.panel} aria-labelledby="lista-fornecedores">
          <div className={styles.sectionHeading}><div><h2 id="lista-fornecedores" ref={cabecalhoRef} tabIndex={-1}>Seus fornecedores</h2><p>Consulte os contatos e mantenha os cadastros organizados.</p></div></div>
          <div className={styles.toolbar}><Input label="Buscar fornecedor" type="search" value={busca} leftIcon={<Search size={20} />} placeholder="Nome, CNPJ ou produto fornecido" onChange={(e) => setBusca(e.target.value)} /><Button variant="secondary" disabled={!busca && filtro === "todos"} onClick={() => { setBusca(""); setFiltro("todos"); }}>Limpar filtros</Button></div>
          <div className={styles.filters} role="group" aria-label="Situação dos fornecedores">{[{ id: "todos", label: "Todos" }, { id: "ativos", label: "Ativos" }, { id: "inativos", label: "Inativos" }].map((opcao) => <Button key={opcao.id} variant={filtro === opcao.id ? "primary" : "secondary"} aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>{opcao.label}</Button>)}</div>
          <p className={styles.muted} role="status">{visiveis.length} de {lista.length} fornecedores</p>
          <div className={styles.cards}>{visiveis.map((f) => <article className={styles.card} key={f.id}>
            <div className={styles.cardTop}><span className={styles.iconBox}><Truck size={26} aria-hidden="true" /></span><span className={f.ativo ? styles.good : styles.neutral}>{f.ativo ? "Ativo" : "Inativo"}</span></div>
            <h3>{f.nome}</h3><p className={styles.muted}>CNPJ: {f.documento || "Não informado"}</p>
            <dl className={styles.details}><div><dt><UserRound size={18} aria-hidden="true" />Contato</dt><dd>{f.contato || "Não informado"}</dd></div><div><dt><Phone size={18} aria-hidden="true" />Telefone</dt><dd>{f.telefone || "Não informado"}</dd></div><div><dt><Package size={18} aria-hidden="true" />Produtos fornecidos</dt><dd>{f.produtos || "Não informados"}</dd></div></dl>
            <div className={styles.cardFooter}><Button variant="secondary" leftIcon={<Pencil size={18} />} onClick={() => abrir(f)} aria-label={`Editar ${f.nome}`}>Editar</Button><Button variant="ghost" onClick={() => alternar(f)} aria-label={`${f.ativo ? "Desativar" : "Reativar"} ${f.nome}`}>{f.ativo ? "Desativar" : "Reativar"}</Button></div>
          </article>)}</div>
          {visiveis.length === 0 && <div className={styles.empty}><Truck size={36} aria-hidden="true" /><h3>Nenhum fornecedor encontrado</h3><p>Tente outro nome ou limpe os filtros.</p><Button variant="secondary" onClick={() => { setBusca(""); setFiltro("todos"); }}>Limpar filtros</Button></div>}
        </section>
      </>}
    </div>
  </AppLayout>;
}

function FornecedorForm({ inicial, lista, onSave, onCancel }: { inicial?: Fornecedor; lista: Fornecedor[]; onSave: (f: Fornecedor) => void; onCancel: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [documento, setDocumento] = useState(inicial?.documento ?? "");
  const [contato, setContato] = useState(inicial?.contato ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [produtos, setProdutos] = useState(inicial?.produtos ?? "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [erros, setErros] = useState<{ nome?: string; documento?: string }>({});
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const documentoRef = useRef<HTMLInputElement>(null);
  useEffect(() => { tituloRef.current?.focus(); }, []);
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const errosNovos: typeof erros = {};
    if (nome.trim().length < 2) errosNovos.nome = "Informe o nome do fornecedor com pelo menos 2 caracteres.";
    if (documento.trim() && !documentoChave(documento)) errosNovos.documento = "Confira o documento digitado ou deixe em branco.";
    if (documentoChave(documento) && lista.some((f) => f.id !== inicial?.id && documentoChave(f.documento) === documentoChave(documento))) errosNovos.documento = "Este documento já foi informado em outro cadastro.";
    setErros(errosNovos);
    if (errosNovos.nome) { nomeRef.current?.focus(); return; }
    if (errosNovos.documento) { documentoRef.current?.focus(); return; }
    onSave({ id: inicial?.id ?? crypto.randomUUID(), nome: nome.trim(), documento: documento.trim(), contato: contato.trim(), telefone: telefone.trim(), produtos: produtos.trim(), ativo });
  }
  return <form className={styles.formPanel} onSubmit={enviar} noValidate>
    <Button variant="ghost" leftIcon={<ArrowLeft size={20} />} onClick={onCancel}>Voltar à lista</Button>
    <div className={styles.sectionHeading}><div><h2 ref={tituloRef} tabIndex={-1}>{inicial ? "Editar fornecedor" : "Novo fornecedor"}</h2><p>O nome é obrigatório. Complete os demais dados quando tiver as informações.</p></div></div>
    <div className={styles.fields}>
      <Input ref={nomeRef} label="Nome do fornecedor" required maxLength={100} value={nome} error={erros.nome} onChange={(e) => { setNome(e.target.value); setErros((v) => ({ ...v, nome: undefined })); }} placeholder="Ex.: Distribuidora de bebidas" />
      <Input ref={documentoRef} label="CNPJ (opcional)" maxLength={30} value={documento} error={erros.documento} onChange={(e) => { setDocumento(e.target.value); setErros((v) => ({ ...v, documento: undefined })); }} hint="Registro manual. Não realiza consulta ou validação oficial do CNPJ." />
      <Input label="Pessoa de contato (opcional)" maxLength={80} value={contato} onChange={(e) => setContato(e.target.value)} />
      <Input label="Telefone (opcional)" type="tel" autoComplete="tel" maxLength={30} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="DDD e número" />
    </div>
    <Input label="Produtos fornecidos (opcional)" maxLength={200} value={produtos} onChange={(e) => setProdutos(e.target.value)} placeholder="Ex.: carne moída, frango e calabresa" />
    <label className={styles.checkbox}><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Fornecedor ativo</label>
    <div className={styles.formFooter}><Button variant="secondary" onClick={onCancel}>Cancelar</Button><Button type="submit" leftIcon={<CheckCircle2 size={20} />}>Salvar fornecedor</Button></div>
  </form>;
}
