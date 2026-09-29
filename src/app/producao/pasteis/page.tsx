"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  escutarPlanejamentos,
  type Planejamentos,
  type SaborPlanejado,
} from "@/services/planejamentosFirestore";
import {
  feirasExtrasNaData,
  useFeirasCadastradas,
} from "@/services/useFeirasCadastradas";
import { chaveSabor, nomeSabor } from "@/lib/nomesSabores";
import styles from "./page.module.css";

// Referência informada para a produção normal de Cerejeiras.
// A previsão do Dono é lida separadamente do Firestore.
const PADRAO_CEREJEIRAS: SaborPlanejado[] = [
  { id: "padrao-carne", nome: "carne", quantidade: 35 },
  { id: "padrao-queijo", nome: "queijo", quantidade: 55 },
  { id: "padrao-pizza", nome: "pizza", quantidade: 30 },
  { id: "padrao-fc", nome: "fc", quantidade: 30 },
  { id: "padrao-fq", nome: "fq", quantidade: 2 },
  { id: "padrao-calabresa", nome: "calabresa", quantidade: 20 },
  { id: "padrao-cq", nome: "c/q", quantidade: 25 },
  { id: "padrao-ovo", nome: "ovo", quantidade: 8 },
  { id: "padrao-cchded", nome: "c.chded", quantidade: 3 },
  { id: "padrao-bauru", nome: "bauru", quantidade: 15 },
  { id: "padrao-seca", nome: "seca", quantidade: 8 },
  { id: "padrao-poro", nome: "poro", quantidade: 8 },
  { id: "padrao-escarola", nome: "escarola", quantidade: 7 },
  { id: "padrao-pernil", nome: "pernil", quantidade: 7 },
  { id: "padrao-costela", nome: "costela", quantidade: 10 },
  { id: "padrao-4-queijos", nome: "4 queijos", quantidade: 4 },
  { id: "padrao-chcolate", nome: "chcolate", quantidade: 2 },
  { id: "padrao-doce", nome: "doce", quantidade: 2 },
  { id: "padrao-especial", nome: "especial", quantidade: 12 },
];

const FEIRAS: Record<string, string> = {
  "jardim-independencia": "Jardim Independência",
  cerejeira: "Cerejeiras",
  "reserva-terca": "Reserva da Serra (terça)",
  cenarios: "Cenários",
  bela: "Bela",
  laranjeira: "Laranjeira",
  macedonia: "Macedônia",
  "santa-clara": "Santa Clara",
  castanheira: "Castanheira",
  "reserva-sexta": "Reserva da Serra (sexta)",
  "embu-das-artes": "Embu das Artes",
};

function hojeBrasil(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const ler = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value;
  return `${ler("year")}-${ler("month")}-${ler("day")}`;
}

function normalizar(nome: string) {
  return chaveSabor(nome);
}

function padraoDaFeira(feiraId: string): SaborPlanejado[] {
  return feiraId === "cerejeira" ? PADRAO_CEREJEIRAS : [];
}

export default function ProducaoPasteisPage() {
  const { usuario } = useAuth();
  const { feirasCadastradas, erroFeirasCadastradas } = useFeirasCadastradas(usuario?.id);
  const [data, setData] = useState(hojeBrasil);
  const [feiraId, setFeiraId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [planejamentos, setPlanejamentos] = useState<Planejamentos>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!usuario) return;
    return escutarPlanejamentos(
      (proximos) => { setPlanejamentos(proximos); setCarregando(false); setErro(null); },
      (falha) => { setErro(falha.message); setCarregando(false); },
    );
  }, [usuario?.id]);

  const feirasDoDia = useMemo(() => {
    // O cadastro é a fonte da agenda: mostra feiras do dia mesmo antes do Dono planejar.
    // Planos antigos continuam visíveis quando a feira já não consta do cadastro.
    const mapa = new Map<string, { id: string; nome: string; responsaveis: string[] }>(
      feirasExtrasNaData(feirasCadastradas, data).map((feira) => [feira.id, {
        id: feira.id, nome: feira.nome, responsaveis: feira.responsaveis,
      }] as const),
    );
    for (const chave of Object.keys(planejamentos)) {
      if (!chave.startsWith(`${data}:`)) continue;
      const id = chave.slice(data.length + 1);
      if (!mapa.has(id)) {
        const cadastrada = feirasCadastradas.find((feira) => feira.id === id);
        mapa.set(id, {
          id, nome: cadastrada?.nome ?? FEIRAS[id] ?? id,
          responsaveis: cadastrada?.responsaveis ?? [],
        });
      }
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [data, planejamentos, feirasCadastradas]);
  const responsaveis = useMemo(() => Array.from(new Set(
    feirasDoDia.flatMap((feira) => feira.responsaveis.map((nome) => nome.trim()).filter(Boolean)),
  )).sort((a, b) => a.localeCompare(b, "pt-BR")), [feirasDoDia]);
  const feirasFiltradas = responsavel
    ? feirasDoDia.filter((feira) => feira.responsaveis.some(
      (nome) => normalizar(nome) === normalizar(responsavel),
    ))
    : feirasDoDia;
  const feiraSelecionada = feirasFiltradas.some((feira) => feira.id === feiraId)
    ? feiraId : (feirasFiltradas[0]?.id ?? "");
  const previstos = feiraSelecionada
    ? planejamentos[`${data}:${feiraSelecionada}`] ?? [] : [];
  const padrao = useMemo(() => padraoDaFeira(feiraSelecionada), [feiraSelecionada]);
  const temPadrao = padrao.length > 0;
  const linhas = useMemo(() => {
    const restantes = new Map(previstos.map((item) => [item.id, item]));
    const resultado: { id: string; nome: string; padrao: number | null; previsto: number }[] = padrao.map((item) => {
      const previsto = restantes.get(item.id) ?? previstos.find((atual) =>
        normalizar(atual.nome) === normalizar(item.nome));
      if (previsto) restantes.delete(previsto.id);
      return {
        id: item.id, nome: item.nome, padrao: item.quantidade,
        previsto: previsto?.quantidade ?? 0,
      };
    });
    for (const item of restantes.values()) {
      resultado.push({ id: item.id, nome: item.nome, padrao: temPadrao ? 0 : null, previsto: item.quantidade });
    }
    return resultado;
  }, [padrao, previstos, temPadrao]);
  const totalPadrao = linhas.reduce((total, item) => total + (item.padrao ?? 0), 0);
  const totalPrevisto = linhas.reduce((total, item) => total + item.previsto, 0);

  return (
    <AppLayout title="Produção de pastéis"
      subtitle="Compare a produção normal com a previsão definida pelo Dono.">
      <div className={styles.page}>
        <Link href="/producao" className={styles.back}>
          <ArrowLeft size={18} aria-hidden="true" /> Voltar para produção
        </Link>
        <section className={styles.panel} aria-labelledby="titulo-previsto">
          <div className={styles.heading}>
            <div>
              <h2 id="titulo-previsto">Planejamento de pastéis</h2>
              <p>Variação = produção prevista − produção padrão.</p>
            </div>
            <CalendarDays size={24} aria-hidden="true" />
          </div>
          <div className={styles.filters}>
            <label htmlFor="data-pasteis">Data da feira
              <input id="data-pasteis" type="date" value={data}
                onChange={(event) => { setData(event.target.value); setResponsavel(""); setFeiraId(""); }} />
            </label>
            <label htmlFor="responsavel-pasteis">Responsável
              <select id="responsavel-pasteis" value={responsavel}
                onChange={(event) => { setResponsavel(event.target.value); setFeiraId(""); }}>
                <option value="">Todos os responsáveis</option>
                {responsaveis.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
              </select>
            </label>
            <label htmlFor="feira-pasteis">Feira
              <select id="feira-pasteis" value={feiraSelecionada}
                onChange={(event) => setFeiraId(event.target.value)}
                disabled={feirasFiltradas.length === 0}>
                {feirasFiltradas.length === 0 && <option value="">Nenhuma feira para este filtro</option>}
                {feirasFiltradas.map((feira) => <option key={feira.id} value={feira.id}>
                  {feira.nome}{feira.responsaveis.length ? ` — ${feira.responsaveis.join(" e ")}` : ""}
                </option>)}
              </select>
            </label>
          </div>
          {erroFeirasCadastradas && <p role="alert" className={styles.error}>{erroFeirasCadastradas}</p>}
          {erro && <p role="alert" className={styles.error}>{erro}</p>}
          {carregando && <p role="status">Carregando planejamentos...</p>}
          {!carregando && !erro && !feiraSelecionada &&
            <p>Não há feira para esta data e responsável. Confira o cadastro de feiras.</p>}
          {!carregando && !erro && feiraSelecionada && (
            <>
              {!Object.prototype.hasOwnProperty.call(planejamentos, `${data}:${feiraSelecionada}`) &&
                <p className={styles.notice}>Esta feira está cadastrada, mas o Dono ainda não registrou a produção prevista para esta data.</p>}
              {padrao.length === 0 && <p className={styles.notice}>
                Esta feira ainda não tem produção padrão cadastrada. A variação
                ficará indisponível até que o padrão seja definido.
              </p>}
              <div className={styles.scroll} role="region" tabIndex={0}
                aria-label="Comparação da produção de pastéis">
                <table className={styles.table}>
                  <thead><tr>
                    <th scope="col">Sabor</th>
                    <th scope="col">Produção padrão</th>
                    <th scope="col">Produção prevista</th>
                    <th scope="col">Variação</th>
                  </tr></thead>
                  <tbody>
                    {linhas.map((item) => {
                      const variacao = item.padrao === null ? null : item.previsto - item.padrao;
                      return <tr key={item.id}>
                        <th scope="row">{nomeSabor(item.nome)}</th>
                        <td>{item.padrao ?? "—"}</td>
                        <td>{item.previsto}</td>
                        <td className={variacao !== null && variacao < 0 ? styles.negative :
                          variacao !== null && variacao > 0 ? styles.positive : styles.neutral}>
                          {variacao === null ? "—" : variacao > 0 ? `+${variacao}` : variacao}
                        </td>
                      </tr>;
                    })}
                  </tbody>
                  <tfoot><tr>
                    <th scope="row">Total</th>
                    <td>{temPadrao ? totalPadrao : "—"}</td>
                    <td>{totalPrevisto}</td>
                    <td className={temPadrao && totalPrevisto - totalPadrao < 0 ? styles.negative :
                      temPadrao && totalPrevisto - totalPadrao > 0 ? styles.positive : styles.neutral}>
                      {!temPadrao ? "—" : totalPrevisto - totalPadrao > 0 ?
                        `+${totalPrevisto - totalPadrao}` : totalPrevisto - totalPadrao}
                    </td>
                  </tr></tfoot>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
