"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Search, Barcode, Plus, ArrowLeft, CheckCircle2, Wine, HelpCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usuarioEstoque } from "@/services/usuarios";
import styles from "./page.module.css";

type Bebida = { id: string; nome: string; volume: string; codigo: string; saldo: number; fardo: number; minimo: number };
type Tela = "inicio" | "selecionar" | "quantidade" | "conferir" | "cadastro";
type Operacao = "entrada" | "saida";
const iniciais: Bebida[] = [
  { id: "coca", nome: "Coca-Cola", volume: "Lata · 350 ml", codigo: "", saldo: 36, fardo: 12, minimo: 12 },
  { id: "agua", nome: "Água mineral", volume: "Garrafa · 500 ml", codigo: "", saldo: 8, fardo: 12, minimo: 12 },
  { id: "guarana", nome: "Guaraná", volume: "Garrafa · 2 litros", codigo: "", saldo: 12, fardo: 6, minimo: 6 },
];
const inteiro = (n: number, min = 1) => Number.isSafeInteger(n) && n >= min;

export default function BarPage() {
  const [bebidas, setBebidas] = useState<Bebida[]>(iniciais);
  const [tela, setTela] = useState<Tela>("inicio");
  const [operacao, setOperacao] = useState<Operacao>("entrada");
  const [selecionadaId, setSelecionadaId] = useState("");
  const [busca, setBusca] = useState("");
  const [embalagem, setEmbalagem] = useState("unidade");
  const [quantidade, setQuantidade] = useState("1");
  const [porFardo, setPorFardo] = useState("12");
  const [avulsas, setAvulsas] = useState("0");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [ajuda, setAjuda] = useState(false);
  const [historico, setHistorico] = useState<string[]>([]);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const confirmou = useRef(false);
  const primeiraRenderizacao = useRef(true);
  const produto = bebidas.find((b) => b.id === selecionadaId);
  const total = embalagem === "fardo"
    ? Number(quantidade) * Number(porFardo) + Number(avulsas)
    : Number(quantidade);
  const saldoDepois = produto ? produto.saldo + (operacao === "entrada" ? total : -total) : 0;
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = bebidas.filter((b) => `${b.nome} ${b.volume}`.toLocaleLowerCase("pt-BR").includes(termo) || (b.codigo !== "" && b.codigo === termo));
  const titulo = tela === "inicio" ? "O que você precisa fazer?" : tela === "selecionar" ? "Qual bebida?" : tela === "quantidade" ? "Informe a quantidade" : tela === "conferir" ? "Confira antes de confirmar" : "Cadastrar bebida";

  useEffect(() => {
    if (primeiraRenderizacao.current) { primeiraRenderizacao.current = false; return; }
    tituloRef.current?.focus();
  }, [tela]);

  function navegar(proxima: Tela) { setErro(""); setTela(proxima); }
  function iniciar(tipo: Operacao) { setOperacao(tipo); setBusca(""); setMensagem(""); navegar("selecionar"); }
  function selecionar(bebida: Bebida, tipo = operacao) {
    setSelecionadaId(bebida.id); setOperacao(tipo); setQuantidade("1");
    setPorFardo(String(bebida.fardo)); setAvulsas("0"); setEmbalagem("unidade");
    confirmou.current = false; setMensagem(""); navegar("quantidade");
  }
  function validar(): string {
    if (!produto) return "Escolha uma bebida para continuar.";
    if (!inteiro(Number(quantidade))) return "Informe uma quantidade inteira maior que zero.";
    if (embalagem === "fardo" && (!inteiro(Number(porFardo)) || avulsas.trim() === "" || !inteiro(Number(avulsas), 0))) return "Confira as unidades por fardo e as unidades avulsas. Use números inteiros.";
    if (!inteiro(total) || !inteiro(saldoDepois, 0)) return operacao === "saida" ? "A saída não pode ser maior que o saldo disponível." : "Quantidade muito grande. Confira os números.";
    return "";
  }
  function conferir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const falha = validar(); if (falha) { setErro(falha); return; }
    confirmou.current = false; navegar("conferir");
  }
  function confirmar() {
    if (confirmou.current) return;
    const falha = validar(); if (falha || !produto) { setErro(falha); return; }
    confirmou.current = true;
    setBebidas((lista) => lista.map((b) => b.id === produto.id ? { ...b, saldo: b.saldo + (operacao === "entrada" ? total : -total) } : b));
    const texto = `${operacao === "entrada" ? "Entrada" : "Saída"} de ${total} unidades de ${produto.nome}. Saldo: ${saldoDepois} unidades.`;
    setHistorico((lista) => [texto, ...lista]); setMensagem(texto); navegar("inicio");
  }
  function cadastrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const dados = new FormData(event.currentTarget);
    const nome = String(dados.get("nome") ?? "").trim(); const volume = String(dados.get("volume") ?? "").trim();
    const codigo = String(dados.get("codigo") ?? "").trim(); const fardo = Number(dados.get("fardo"));
    if (!nome || !volume || !inteiro(fardo)) { setErro("Preencha nome, embalagem e unidades por fardo."); return; }
    if (codigo && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(codigo)) { setErro("Digite os 8, 12, 13 ou 14 números do código, ou deixe em branco."); return; }
    if (codigo && bebidas.some((b) => b.codigo === codigo)) { setErro("Este código já pertence a uma bebida cadastrada."); return; }
    if (bebidas.some((b) => b.nome.toLowerCase() === nome.toLowerCase() && b.volume.toLowerCase() === volume.toLowerCase())) { setErro("Esta bebida e embalagem já estão cadastradas."); return; }
    const nova = { id: crypto.randomUUID(), nome, volume, codigo, saldo: 0, fardo, minimo: 6 };
    setBebidas((lista) => [...lista, nova]); setMensagem(`${nome} cadastrada com saldo zero. Use Receber para adicionar unidades.`); setBusca(""); navegar("inicio");
  }

  return (
    <AppLayout user={usuarioEstoque} title="Bar" subtitle="Estoque de bebidas">
      <div className={styles.page}>
        <p className={styles.demo}>Ambiente de demonstração · Os dados voltam ao início ao sair desta página ou recarregar.</p>
        <div className={styles.heading}>
          <div>
            {tela !== "inicio" && <Button type="button" variant="ghost" className={styles.back} onClick={() => navegar(tela === "conferir" ? "quantidade" : tela === "quantidade" ? "selecionar" : "inicio")}><ArrowLeft aria-hidden="true" size={20} /> Voltar</Button>}
            <h2 tabIndex={-1} ref={tituloRef}>{titulo}</h2>
            {(tela === "quantidade" || tela === "conferir" || tela === "selecionar") && <p>{operacao === "entrada" ? "Receber bebidas" : "Registrar saída"} · Etapa {tela === "selecionar" ? 1 : tela === "quantidade" ? 2 : 3} de 3</p>}
          </div>
          <Button type="button" variant="secondary" aria-expanded={ajuda} aria-controls="ajuda-bar" onClick={() => setAjuda(!ajuda)}><HelpCircle size={20} aria-hidden="true" /> Ajuda</Button>
        </div>
        {ajuda && <div id="ajuda-bar" className={styles.help}>Use <strong>Receber</strong> quando chegarem bebidas e <strong>Registrar saída</strong> quando forem retiradas. Um fardo reúne várias unidades: confira a quantidade na embalagem. Você poderá corrigir os números antes de confirmar.</div>}
        <div role="status" aria-live="polite">{mensagem && <p className={styles.success}><CheckCircle2 aria-hidden="true" size={24} /> {mensagem}</p>}</div>
        {erro && <p role="alert" id="erro-bar" className={styles.error}>{erro}</p>}

        {tela === "inicio" && <div className={styles.actions}>
          <Button type="button" fullWidth onClick={() => iniciar("entrada")}><span className={styles.actionContent}><ArrowDownToLine aria-hidden="true" /><strong>Receber bebidas</strong><span>Adicionar unidades ou fardos</span></span></Button>
          <Button type="button" variant="secondary" fullWidth onClick={() => iniciar("saida")}><span className={styles.actionContent}><ArrowUpFromLine aria-hidden="true" /><strong>Registrar saída</strong><span>Retirar bebidas do estoque</span></span></Button>
          <Button type="button" variant="secondary" fullWidth onClick={() => { setBusca(""); buscaRef.current?.focus(); }}><span className={styles.actionContent}><Search aria-hidden="true" /><strong>Consultar estoque</strong><span>Encontrar uma bebida e seu saldo</span></span></Button>
        </div>}

        {(tela === "inicio" || tela === "selecionar") && <section className={styles.stock} aria-label="Bebidas disponíveis">
          <div className={styles.sectionHeading}><h3>{tela === "inicio" ? "Suas bebidas" : "Selecione a bebida"}</h3><span>{bebidas.length} bebidas cadastradas</span></div>
          <form onSubmit={(event) => { event.preventDefault(); if (tela === "selecionar" && filtradas.length === 1) selecionar(filtradas[0]); }}>
            <Input label="Buscar pelo nome ou código de barras" ref={buscaRef} id="busca-bar" type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Ex.: água mineral" leftIcon={<Barcode size={20} />} hint="Digite o código ou use um leitor USB neste campo. A leitura pela câmera ainda não está disponível." />
          </form>
          <p className={styles.hint} role="status">{filtradas.length} bebidas encontradas</p>
          <div className={styles.cards}>{filtradas.map((bebida) => <article key={bebida.id} className={styles.card}>
            <div className={styles.productIcon}><Wine aria-hidden="true" size={32} /></div>
            <div><h4>{bebida.nome}</h4><p>{bebida.volume}</p></div>
            <span className={bebida.saldo <= bebida.minimo ? styles.low : styles.normal}>{bebida.saldo === 0 ? "Sem estoque" : bebida.saldo <= bebida.minimo ? "Estoque baixo" : "Em estoque"}</span>
            <p className={styles.balance}><strong>{bebida.saldo}</strong> unidades</p>
            {tela === "selecionar" ? <Button type="button" variant="primary" disabled={operacao === "saida" && bebida.saldo === 0} onClick={() => selecionar(bebida)} aria-label={`Selecionar bebida ${bebida.nome}, ${bebida.volume}`}>Selecionar bebida</Button> : <div className={styles.cardButtons}><Button type="button" variant="secondary" onClick={() => selecionar(bebida, "entrada")} aria-label={`Receber ${bebida.nome}, ${bebida.volume}`}>Receber</Button><Button type="button" variant="secondary" disabled={bebida.saldo === 0} onClick={() => selecionar(bebida, "saida")} aria-label={`Retirar ${bebida.nome}, ${bebida.volume}`}>Retirar</Button></div>}
          </article>)}</div>
          {filtradas.length === 0 && <p className={styles.empty}>Nenhuma bebida encontrada. Confira o nome ou cadastre uma nova bebida.</p>}
          <Button type="button" variant="secondary" onClick={() => navegar("cadastro")}><Plus size={20} aria-hidden="true" /> Cadastrar bebida</Button>
        </section>}

        {tela === "quantidade" && produto && <form className={styles.panel} onSubmit={conferir} aria-describedby={erro ? "erro-bar" : undefined}>
          <div className={styles.productSummary}><Wine aria-hidden="true" size={32} /><div><h3>{produto.nome}</h3><p>{produto.volume} · Disponível: <strong>{produto.saldo} unidades</strong></p></div></div>
          <fieldset className={styles.options}><legend>Como você vai contar?</legend>{["unidade", "fardo"].map((valor) => <label key={valor}><input type="radio" name="embalagem" value={valor} checked={embalagem === valor} onChange={() => setEmbalagem(valor)} />{valor === "unidade" ? "Unidades" : "Fardos / caixas"}</label>)}</fieldset>
          <div className={styles.fields}>
            <Input label={embalagem === "fardo" ? "Quantidade de fardos / caixas" : "Quantidade de unidades"} id="quantidade" type="number" inputMode="numeric" min="1" step="1" required value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            {embalagem === "fardo" && <><Input label="Unidades em cada fardo / caixa" id="por-fardo" type="number" inputMode="numeric" min="1" step="1" required value={porFardo} onChange={(e) => setPorFardo(e.target.value)} /><Input label="Unidades avulsas adicionais" id="avulsas" type="number" inputMode="numeric" min="0" step="1" required value={avulsas} onChange={(e) => setAvulsas(e.target.value)} /></>}
          </div>
          <p className={styles.total} aria-live="polite">Total: <strong>{inteiro(total, 0) ? total : "—"} unidades</strong></p>
          <div className={styles.footer}><Button type="button" variant="secondary" onClick={() => navegar("inicio")}>Cancelar</Button><Button type="submit" variant="primary">Conferir {operacao === "entrada" ? "entrada" : "saída"}</Button></div>
        </form>}

        {tela === "conferir" && produto && <section className={styles.panel} aria-label="Resumo da movimentação">
          <h3>{produto.nome}</h3><p>{produto.volume}</p>
          {embalagem === "fardo" && <p>{quantidade} fardos × {porFardo} unidades + {avulsas} unidades avulsas</p>}
          <dl className={styles.summary}><div><dt>{operacao === "entrada" ? "Quantidade recebida" : "Quantidade retirada"}</dt><dd>{total} unidades</dd></div><div><dt>Saldo atual</dt><dd>{produto.saldo} unidades</dd></div><div><dt>Saldo após confirmar</dt><dd>{saldoDepois} unidades</dd></div></dl>
          <div className={styles.footer}><Button type="button" variant="secondary" onClick={() => navegar("quantidade")}>Corrigir quantidade</Button><Button type="button" variant="success" onClick={confirmar}><CheckCircle2 size={22} aria-hidden="true" /> Confirmar {operacao === "entrada" ? "entrada" : "saída"}</Button></div>
        </section>}

        {tela === "cadastro" && <form className={styles.panel} onSubmit={cadastrar}>
          <p>Cadastre a bebida com saldo zero. Depois, registre a quantidade recebida.</p>
          <div className={styles.fields}><Input label="Nome da bebida" id="nome" name="nome" required maxLength={80} placeholder="Ex.: Suco de uva" /><Input label="Embalagem e volume" id="volume" name="volume" required maxLength={60} placeholder="Ex.: Caixa · 200 ml" /><Input label="Código de barras (opcional)" id="codigo" name="codigo" inputMode="numeric" maxLength={14} aria-describedby="codigo-ajuda" /><Input label="Unidades por fardo / caixa" id="fardo" name="fardo" type="number" inputMode="numeric" required min="1" step="1" defaultValue="12" /></div>
          <p id="codigo-ajuda" className={styles.hint}>Use o código impresso na unidade. O código não preenche automaticamente o nome. As bebidas de exemplo não têm códigos associados.</p>
          <div className={styles.footer}><Button type="button" variant="secondary" onClick={() => navegar("inicio")}>Cancelar</Button><Button variant="primary" type="submit">Cadastrar bebida</Button></div>
        </form>}
        {tela === "inicio" && historico.length > 0 && <section className={styles.stock}><h3>Movimentações desta visita</h3><ul className={styles.history}>{historico.map((texto, index) => <li key={index}>{texto}</li>)}</ul></section>}
      </div>
    </AppLayout>
  );
}
