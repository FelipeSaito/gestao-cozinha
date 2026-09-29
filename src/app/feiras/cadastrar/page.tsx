"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { cadastrarFeira } from "@/services/feirasCadastradas";
import styles from "./page.module.css";


const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado"];

export default function CadastrarFeiraPage() {
  const { usuario, carregando } = useAuth();
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"semanal" | "evento">("semanal");
  const [diaSemana, setDiaSemana] = useState("1");
  const [data, setData] = useState("");
  const [responsaveis, setResponsaveis] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const operacaoId = useRef<string | null>(null);
  const enviando = useRef(false);
  const dono = usuario?.perfil === "dono" || usuario?.perfis?.includes("dono");

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dono || enviando.current) return;
    if (!nome.trim() || (tipo === "evento" && !data)) {
      setErro("Informe o nome e a data do evento, quando necessário.");
      return;
    }
    enviando.current = true;
    setSalvando(true);
    setErro("");
    try {
      operacaoId.current ??= crypto.randomUUID();
      await cadastrarFeira({
        id: operacaoId.current,
        nome: nome.trim(),
        responsaveis: responsaveis.split(",").map((item) => item.trim()).filter(Boolean),
        ...(tipo === "semanal" ? { tipo, diaSemana: Number(diaSemana) } : { tipo, data }),
      });
      operacaoId.current = null;
      router.push("/feiras");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível cadastrar a feira.");
    } finally {
      enviando.current = false;
      setSalvando(false);
    }
  }

  return (
    <AppLayout title="Cadastrar feira ou evento"
      subtitle="Defina onde e quando a equipe participará.">
      <div className={styles.page}>
        {!carregando && !dono ? (
          <p role="alert">Somente o Dono pode cadastrar feiras e eventos.</p>
        ) : dono ? (
          <form className={styles.form} onSubmit={salvar}>
            <h2>Novo cadastro</h2>
            <label>Nome da feira ou evento
              <input required maxLength={100} value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Ex.: Feira do bairro" />
            </label>
            <label>Tipo
              <select value={tipo} onChange={(event) => setTipo(
                event.target.value as "semanal" | "evento")}>
                <option value="semanal">Feira semanal</option>
                <option value="evento">Evento em data específica</option>
              </select>
            </label>
            {tipo === "semanal" ? (
              <label>Dia da semana
                <select value={diaSemana} onChange={(event) => setDiaSemana(event.target.value)}>
                  {DIAS.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}
                </select>
              </label>
            ) : (
              <label>Data do evento
                <input required type="date" value={data}
                  onChange={(event) => setData(event.target.value)} />
              </label>
            )}
            <label>Responsáveis (opcional, separados por vírgula)
              <input value={responsaveis} onChange={(event) =>
                setResponsaveis(event.target.value)}
                placeholder="Ex.: Márcio, Haru" />
            </label>
            {erro && <p role="alert" className={styles.error}>{erro}</p>}
            <div className={styles.actions}>
              <Link href="/feiras" className={styles.cancel}>Cancelar</Link>
              <button disabled={salvando} type="submit">
                {salvando ? "Salvando..." : "Cadastrar"}
              </button>
            </div>
          </form>
        ) : <p>Carregando perfil...</p>}
      </div>
    </AppLayout>
  );
}
