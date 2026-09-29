"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { ArrowLeft, BarChart3, ChefHat, Delete, KeyRound, LockKeyhole, PackageCheck, ShieldCheck, Soup, UserRoundCheck, Wine } from "lucide-react";
import type { UserRole } from "@/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getRotaInicial, useAuth } from "@/contexts/AuthContext";
import { entrarComFirebase } from "@/services/authFirebase";
import { firebaseClient } from "@/lib/firebase";
import styles from "./login.module.css";

type Setor = "producao" | "feirantes" | "administracao";
type Cartao = { perfil: UserRole; nome: string; descricao: string; iniciais: string };
type Funcionario = { id: string; nome: string; iniciais: string; perfis: Setor[] };
const CARTOES: Cartao[] = [
  { perfil: "dono", nome: "Dono", iniciais: "DO", descricao: "Visão geral e relatórios" },
  { perfil: "producao", nome: "Produção", iniciais: "PR", descricao: "Estoque da cozinha e preparo" },
  { perfil: "feirantes", nome: "Feirantes", iniciais: "FE", descricao: "Saída e contagem de sobras" },
  { perfil: "administracao", nome: "Administração", iniciais: "AD", descricao: "Estoque principal e transferências" },
];

export default function LoginPage() {
  const router = useRouter();
  const { usuario, carregando: verificando } = useAuth();
  const [cartao, setCartao] = useState<Cartao | null>(null);
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const pessoasDoSetor = useMemo(() => lista.filter((p) => cartao?.perfil !== "dono" && p.perfis.includes(cartao?.perfil as Setor)), [lista, cartao]);

  useEffect(() => { if (cartao) tituloRef.current?.focus(); }, [cartao, funcionario]);
  useEffect(() => { if (!verificando && usuario) router.replace(getRotaInicial(usuario.perfil)); }, [verificando, usuario, router]);

  useEffect(() => {
    if (!cartao || cartao.perfil === "dono") return;
    let ativo = true;
    setBuscando(true); setErro(null);
    fetch("/api/auth/funcionarios", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error("Não foi possível carregar os funcionários.");
        return resposta.json() as Promise<Funcionario[]>;
      })
      .then((dados) => { if (ativo) setLista(dados); })
      .catch(() => { if (ativo) setErro("Não foi possível carregar os funcionários."); })
      .finally(() => { if (ativo) setBuscando(false); });
    return () => { ativo = false; };
  }, [cartao]);

  function voltar() {
    if (enviando) return;
    setErro(null); setPin(""); setSenha("");
    if (funcionario) setFuncionario(null); else setCartao(null);
  }

  async function entrarDono(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartao || enviando) return;
    setErro(null); setEnviando(true);
    try {
      await entrarComFirebase(email, senha, "dono");
      router.replace(getRotaInicial("dono"));
    } catch {
      setErro("Não foi possível entrar. Confira e-mail e senha."); setSenha("");
    } finally { setEnviando(false); }
  }

  async function entrarFuncionario() {
    if (!cartao || !funcionario || enviando) return;
    if (pin.length !== 6) { setErro("Digite os seis números do PIN."); return; }
    setErro(null); setEnviando(true);
    try {
      const resposta = await fetch("/api/auth/pin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionarioId: funcionario.id, pin }),
      });
      if (!resposta.ok) throw new Error("Funcionário ou PIN inválido.");
      const dados: { token: string } = await resposta.json();
      await signInWithCustomToken(firebaseClient().auth, dados.token);
      router.replace(getRotaInicial(cartao.perfil));
    } catch { setErro("Funcionário ou PIN inválido."); setPin(""); }
    finally { setEnviando(false); }
  }

  function handlePinKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key >= "0" && event.key <= "9") { event.preventDefault(); setPin((atual) => (atual + event.key).slice(0, 6)); }
    if (event.key === "Backspace" || event.key === "Delete") { event.preventDefault(); setPin((atual) => atual.slice(0, -1)); }
    if (event.key === "Enter") { event.preventDefault(); void entrarFuncionario(); }
    if (event.key === "Escape") { event.preventDefault(); voltar(); }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true"><ChefHat size={26} /></span><div><strong>Gestão de Cozinha</strong><span>Pastelaria</span></div></div>
        <div className={styles.security}><ShieldCheck size={20} aria-hidden="true" /><span>Acesso de funcionários</span></div>
      </header>
      {!cartao ? (
        <section className={styles.selection} aria-labelledby="titulo-selecao">
          <div className={styles.intro}><h1 id="titulo-selecao">Quem está usando?</h1><p>Toque na sua área para continuar.</p></div>
          <div className={styles.profiles}>{CARTOES.map((item) => (
            <button key={item.perfil} type="button" className={styles.profileCard} onClick={() => { setCartao(item); setErro(null); }}>
              <span className={`${styles.avatar} ${styles[item.perfil]}`} aria-hidden="true">{item.iniciais}</span>
              <span className={styles.profileText}><strong>{item.nome}</strong><small>{item.descricao}</small></span>
            </button>
          ))}</div>
          <p className={styles.demoNotice}><LockKeyhole size={18} aria-hidden="true" />Cada funcionário entra com seu próprio PIN.</p>
        </section>
      ) : (
        <section className={styles.pinScreen} aria-labelledby="titulo-login">
          <Button variant="ghost" leftIcon={<ArrowLeft size={20} />} onClick={voltar} disabled={enviando}>Voltar</Button>
          <div className={styles.pinCard}>
            <span className={`${styles.avatar} ${styles.avatarLarge} ${styles[cartao.perfil]}`} aria-hidden="true">{funcionario?.iniciais ?? cartao.iniciais}</span>
            <div className={styles.pinHeading}><h1 id="titulo-login" ref={tituloRef} tabIndex={-1}>Olá, {funcionario?.nome ?? cartao.nome}</h1>
              <p>{cartao.perfil === "dono" ? "Entre com e-mail e senha." : funcionario ? "Digite seu PIN individual." : "Escolha seu nome."}</p></div>
            {cartao.perfil === "dono" ? (
              <form className={styles.loginForm} onSubmit={entrarDono}>
                <label htmlFor="login-email">E-mail</label>
                <input id="login-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={enviando} />
                <label htmlFor="login-password">Senha</label>
                <input id="login-password" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required disabled={enviando} />
                {erro && <Alert variant="danger">{erro}</Alert>}
                <Button type="submit" size="large" fullWidth loading={enviando} leftIcon={<KeyRound size={20} />}>Entrar</Button>
              </form>
            ) : !funcionario ? (
              <div className={styles.staffList}>
                {buscando && <p>Carregando equipe...</p>}
                {!buscando && pessoasDoSetor.length === 0 && <p>Nenhum funcionário cadastrado nessa área.</p>}
                {pessoasDoSetor.map((pessoa) => (
                  <button key={pessoa.id} type="button" onClick={() => { setFuncionario(pessoa); setErro(null); setPin(""); }}>
                    <span className={styles.staffAvatar} aria-hidden="true">{pessoa.iniciais}</span>{pessoa.nome}
                  </button>
                ))}
                {erro && <Alert variant="danger">{erro}</Alert>}
              </div>
            ) : (
              <div className={styles.pinEntry} onKeyDown={handlePinKeyDown}>
                <div className={styles.pinDots} role="status" aria-label={`${pin.length} de 6 números digitados`}>
                  {[0, 1, 2, 3, 4, 5].map((index) => <span key={index} className={index < pin.length ? styles.dotFilled : ""} aria-hidden="true" />)}
                </div>
                {erro && <Alert variant="danger">{erro}</Alert>}
                <div className={styles.keypad} aria-label="Teclado numérico">
                  {["1","2","3","4","5","6","7","8","9"].map((n) => <button key={n} type="button" onClick={() => setPin((v) => (v + n).slice(0, 6))} disabled={enviando}>{n}</button>)}
                  <span aria-hidden="true" />
                  <button type="button" onClick={() => setPin((v) => (v + "0").slice(0, 6))} disabled={enviando}>0</button>
                  <button type="button" className={styles.deleteKey} onClick={() => setPin((v) => v.slice(0, -1))} disabled={enviando || !pin} aria-label="Apagar último número"><Delete size={26} /></button>
                </div>
                <Button size="large" fullWidth loading={enviando} leftIcon={<KeyRound size={20} />}
                  disabled={pin.length !== 6} onClick={() => void entrarFuncionario()}>Entrar</Button>
                <p className={styles.keyboardHint}>Use o teclado ou toque nos números.</p>
              </div>
            )}
          </div>
        </section>
      )}
      <footer className={styles.footer}>
        <span><PackageCheck size={18} aria-hidden="true" /> Estoque</span>
        <span><Soup size={18} aria-hidden="true" /> Produção</span>
        <span><Wine size={18} aria-hidden="true" /> Feiras</span>
        <span><BarChart3 size={18} aria-hidden="true" /> Relatórios para Dono</span>
        <span className={styles.visuallyHidden}><UserRoundCheck /> Seleção de funcionário</span>
      </footer>
    </main>
  );
}