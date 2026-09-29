"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Users,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import {
  escutarPlanejamentos,
  importarPlanejamentoLocal,
  salvarPlanejamentoFirestore,
  type Planejamentos,
  type SaborPlanejado,
} from "@/services/planejamentosFirestore";
import {
  escutarSaidas,
  importarSaidaLocal,
  salvarSaidaFirestore,
  type ItemSaida,
  type RegistroSaida,
  type Saidas,
} from "@/services/saidasFirestore";
import {
  escutarFechamentos,
  importarFechamentoLocal,
  salvarFechamentoFirestore,
  type ItemRetorno,
  type RegistroRetorno,
  type Retornos,
} from "@/services/fechamentosFirestore";
import {
  escutarReaproveitamentos,
  salvarReaproveitamentoFirestore,
  type Reaproveitamentos,
} from "@/services/reaproveitamentosFirestore";
import {
  escutarProducaoFeiras,
  salvarProducaoFeira,
  type ProducoesFeira,
  type RegistroProducao,
} from "@/services/producaoFeirasFirestore";

import {
  useFeirasCadastradas,
  feirasExtrasNaData,
} from "@/services/useFeirasCadastradas";
import type { FeiraCadastrada } from "@/services/feirasCadastradas";
import { chaveSabor, nomeSabor } from "@/lib/nomesSabores";

import styles from "./page.module.css";

interface FeiraProgramada {
  id: string;
  nome: string;
  responsaveis: string[];
  turno?: string;
}

const STORAGE_KEY = "gestao-cozinha-feiras-planejamento-v1";

function chaveDaSobra(chaveOrigem: string, saborId: string) {
  return `${chaveOrigem}|${saborId}`;
}

function nomeNormalizado(nome: string) {
  return chaveSabor(nome);
}

function feirasDaData(dataIso: string, extras: FeiraCadastrada[]): FeiraProgramada[] {
  const data = dataDoCampo(dataIso);
  if (!data) return [];
  const cadastradas = feirasExtrasNaData(extras, dataIso).map((feira) => ({
    id: feira.id, nome: feira.nome, responsaveis: feira.responsaveis,
    ...(feira.tipo === "evento" ? { turno: "Evento" } : feira.turno ? { turno: feira.turno } : {}),
  }));
  return cadastradas;
}

function nomeDaFeira(feiraId: string, extras: FeiraCadastrada[]) {
  return extras.find((feira) => feira.id === feiraId)?.nome ?? feiraId;
}

const SABORES_CEREJEIRAS: SaborPlanejado[] = [
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

function ReaproveitamentoFeira({
  chaveDestino,
  sabores,
  retornos,
  usos,
  onSalvar,
  feirasCadastradas,
}: {
  chaveDestino: string;
  sabores: SaborPlanejado[];
  retornos: Retornos;
  usos: Reaproveitamentos;
  onSalvar: (valores: Record<string, number>) => Promise<void>;
  feirasCadastradas: FeiraCadastrada[];
}) {
  const dataDestino = chaveDestino.split(":")[0];
  const origens = Object.entries(retornos).flatMap(([chaveOrigem, retorno]) => {
    if (chaveOrigem.split(":")[0] >= dataDestino) return [];
    const feiraId = chaveOrigem.split(":")[1];
    const nomeFeira = nomeDaFeira(feiraId, feirasCadastradas);
    return retorno.itens.filter((item) =>
      item.sobraram > 0 && (
        sabores.some((sabor) => nomeNormalizado(sabor.nome) === nomeNormalizado(item.nome)) ||
        (usos[chaveDestino]?.[chaveDaSobra(chaveOrigem, item.saborId)] ?? 0) > 0
      ),
    ).map((item) => ({
      id: chaveDaSobra(chaveOrigem, item.saborId),
      nome: item.nome,
      data: chaveOrigem.split(":")[0],
      feira: nomeFeira,
      total: item.sobraram,
    }));
  });
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(origens.map((origem) => [origem.id, String(usos[chaveDestino]?.[origem.id] ?? "")])),
  );
  const [erro, setErro] = useState("");
  const [salvandoUso, setSalvandoUso] = useState(false);

  async function salvar() {
    const proximo: Record<string, number> = {};
    for (const origem of origens) {
      const texto = valores[origem.id]?.trim() ?? "";
      const quantidade = texto === "" ? 0 : Number(texto);
      const usadosEmOutrasFeiras = Object.entries(usos).reduce(
        (total, [chave, itens]) => total + (chave === chaveDestino ? 0 : (itens[origem.id] ?? 0)), 0,
      );
      if (!Number.isSafeInteger(quantidade) || quantidade < 0 || quantidade > origem.total - usadosEmOutrasFeiras) {
        setErro(`Confira a quantidade de ${nomeSabor(origem.nome)} de ${origem.feira}: o saldo disponível foi ultrapassado.`);
        return;
      }
      if (quantidade > 0) proximo[origem.id] = quantidade;
    }
    for (const sabor of sabores) {
      const quantidade = origens.reduce((total, origem) =>
        total + (nomeNormalizado(origem.nome) === nomeNormalizado(sabor.nome) ? (proximo[origem.id] ?? 0) : 0), 0,
      );
      if (quantidade > sabor.quantidade) {
        setErro(`O reaproveitamento de ${nomeSabor(sabor.nome)} supera os ${sabor.quantidade} pastéis previstos para esta feira.`);
        return;
      }
    }
    if (origens.some((origem) =>
      (proximo[origem.id] ?? 0) > 0 &&
      !sabores.some((sabor) => nomeNormalizado(sabor.nome) === nomeNormalizado(origem.nome)),
    )) {
      setErro("Remova o uso de sabores que não estão no planejamento desta feira.");
      return;
    }
    setSalvandoUso(true);
    try {
      await onSalvar(proximo);
      setErro("");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível salvar o reaproveitamento.");
    } finally {
      setSalvandoUso(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", padding: 14, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 12 }}>
      <h5 style={{ fontSize: 16 }}>Pastéis da geladeira para esta feira</h5>
      {origens.length === 0 ? <p>Não há sobras anteriores dos sabores planejados.</p> : <>
        <p>Informe quantos pastéis de cada origem serão usados. Deixe vazio quando não for usar.</p>
        {origens.map((origem) => {
          const outros = Object.entries(usos).reduce((total, [chave, itens]) =>
            total + (chave === chaveDestino ? 0 : (itens[origem.id] ?? 0)), 0,
          );
          return (
            <label key={origem.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBlock: 8, borderBottom: "1px solid var(--color-border, #dfe5ec)" }}>
              <span><strong>{nomeSabor(origem.nome)}</strong><br /><small>{origem.feira} · {origem.data.split("-").reverse().join("/")} · disponível: {Math.max(0, origem.total - outros)}</small></span>
              <span style={{ display: "grid", gap: 4 }}>Usar nesta feira
                <input type="number" min={0} step={1} inputMode="numeric" value={valores[origem.id] ?? ""}
                  onChange={(event) => { setValores((atual) => ({ ...atual, [origem.id]: event.target.value })); setErro(""); }}
                  style={{ width: 110, minHeight: 48, padding: 8, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }} />
              </span>
            </label>
          );
        })}
        {erro && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>{erro}</p>}
        <Button type="button" variant="primary" disabled={salvandoUso} onClick={salvar}>
          {salvandoUso ? "Salvando..." : "Salvar reaproveitamento"}
        </Button>
      </>}
    </div>
  );
}

function RegistroProducaoFeira({
  sabores,
  registros,
  usuarioId,
  limitePorSabor,
  onSalvar,
}: {
  sabores: SaborPlanejado[];
  registros: RegistroProducao[];
  usuarioId: string;
  limitePorSabor: Record<string, number>;
  onSalvar: (saborId: string, quantidade: number) => Promise<void>;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(sabores.map((sabor) => [sabor.id,
      String(registros.find((item) => item.saborId === sabor.id && item.funcionarioId === usuarioId)?.quantidade ?? "")])));
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function salvar(sabor: SaborPlanejado) {
    const texto = valores[sabor.id]?.trim() ?? "";
    if (texto === "" || !/^\d+$/.test(texto)) {
      setErro(`Informe quantos pastéis de ${nomeSabor(sabor.nome)} você produziu. Digite 0 para corrigir o registro.`);
      return;
    }
    const quantidade = Number(texto);
    const colegas = registros.filter((item) => item.saborId === sabor.id && item.funcionarioId !== usuarioId)
      .reduce((soma, item) => soma + item.quantidade, 0);
    if (!Number.isSafeInteger(quantidade) || quantidade < 0 ||
        quantidade + colegas > limitePorSabor[sabor.id]) {
      setErro(`O total produzido de ${nomeSabor(sabor.nome)} ultrapassa os ${limitePorSabor[sabor.id]} pastéis a preparar.`);
      return;
    }
    setSalvando(sabor.id);
    setErro("");
    try {
      await onSalvar(sabor.id, quantidade);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a produção.");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%", padding: 14, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 12 }}>
      <h5 style={{ fontSize: 16 }}>Registrar produção desta feira</h5>
      <p>Informe o total que você produziu por sabor. Ao corrigir, substitua seu número anterior.</p>
      {sabores.map((sabor) => {
        const total = registros.filter((item) => item.saborId === sabor.id)
          .reduce((soma, item) => soma + item.quantidade, 0);
        return (
          <div key={sabor.id} style={{ display: "grid", gap: 6, borderBottom: "1px solid var(--color-border, #dfe5ec)", paddingBlock: 10 }}>
            <strong>{nomeSabor(sabor.nome)}: {total} de {limitePorSabor[sabor.id]} a preparar</strong>
            <small>{registros.filter((item) => item.saborId === sabor.id && item.quantidade > 0)
              .map((item) => `${item.funcionario}: ${item.quantidade}`).join(" · ") || "Nenhum registro"}</small>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 8 }}>
              <label style={{ display: "grid", gap: 4 }}>Produzidos por você
                <input type="number" min={0} max={limitePorSabor[sabor.id]} step={1} inputMode="numeric"
                  placeholder="Digite a quantidade" value={valores[sabor.id] ?? ""}
                  onChange={(event) => { setValores((atual) => ({ ...atual, [sabor.id]: event.target.value })); setErro(""); }}
                  style={{ width: 155, minHeight: 48, padding: 8, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }} />
              </label>
              <Button type="button" variant="secondary" disabled={salvando !== null}
                onClick={() => salvar(sabor)}>{salvando === sabor.id ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        );
      })}
      {erro && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>{erro}</p>}
    </div>
  );
}

function PlanejadorSabores({
  sabores,
  bloqueado,
  onSalvar,
}: {
  sabores: SaborPlanejado[];
  bloqueado: boolean;
  onSalvar: (itens: SaborPlanejado[]) => Promise<void>;
}) {
  const catalogo = [
    ...SABORES_CEREJEIRAS,
    ...sabores.filter((atual) =>
      !SABORES_CEREJEIRAS.some((padrao) =>
        chaveSabor(padrao.nome) === chaveSabor(atual.nome),
      ),
    ),
  ];
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(catalogo.map((sabor) => [sabor.nome, sabores.some((atual) => chaveSabor(atual.nome) === chaveSabor(sabor.nome))])),
  );
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(catalogo.map((sabor) => [sabor.nome, String(sabores.find((atual) => chaveSabor(atual.nome) === chaveSabor(sabor.nome))?.quantidade ?? "")])),
  );
  const [erroPlanejamento, setErroPlanejamento] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const escolhidos = catalogo.filter((sabor) => selecionados[sabor.nome]);
    if (escolhidos.length === 0) {
      setErroPlanejamento("Selecione ao menos um sabor.");
      return;
    }
    if (escolhidos.some((sabor) => {
      const valor = quantidades[sabor.nome]?.trim();
      return !valor || !Number.isSafeInteger(Number(valor)) || Number(valor) <= 0;
    })) {
      setErroPlanejamento("Informe uma quantidade inteira maior que zero para cada sabor selecionado.");
      return;
    }
    setSalvando(true);
    try {
      await onSalvar(escolhidos.map((sabor) => ({
      id: sabores.find((atual) => chaveSabor(atual.nome) === chaveSabor(sabor.nome))?.id ?? sabor.id,
      nome: nomeSabor(sabor.nome),
      quantidade: Number(quantidades[sabor.nome]),
      })));
      setErroPlanejamento("");
    } catch (erro) {
      setErroPlanejamento(erro instanceof Error ? erro.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  if (bloqueado) return <p>Esta feira já foi fechada. Reabra a feira para corrigir os sabores.</p>;

  return (
    <div style={{ display: "grid", gap: 14, width: "100%" }}>
      <h5 style={{ fontSize: 16 }}>Selecione os sabores e as quantidades</h5>
      <p>Marque apenas os sabores que irão para esta feira.</p>
      <div style={{ display: "grid", gap: 10 }}>
        {catalogo.map((sabor) => {
          const marcado = Boolean(selecionados[sabor.nome]);
          return (
            <div key={sabor.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: 10, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, cursor: "pointer" }}>
                <input type="checkbox" checked={marcado} onChange={(event) => {
                  setSelecionados((atual) => ({ ...atual, [sabor.nome]: event.target.checked }));
                  setErroPlanejamento("");
                }} style={{ width: 22, height: 22 }} />
                <strong>{nomeSabor(sabor.nome)}</strong>
              </label>
              {marcado && (
                <label style={{ display: "grid", gap: 4 }}>
                  Quantidade
                  <input type="number" min={1} step={1} inputMode="numeric" value={quantidades[sabor.nome] ?? ""}
                    onChange={(event) => { setQuantidades((atual) => ({ ...atual, [sabor.nome]: event.target.value })); setErroPlanejamento(""); }}
                    style={{ width: 110, minHeight: 48, padding: 8, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }} />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {erroPlanejamento && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>{erroPlanejamento}</p>}
      <Button type="button" variant="primary" disabled={salvando} onClick={salvar}>
        {salvando ? "Salvando..." : "Salvar planejamento"}
      </Button>
    </div>
  );
}

function chaveDaFeira(data: string, feiraId: string): string {
  return `${data}:${feiraId}`;
}

function saboresDaFeira(
  planejamentos: Planejamentos,
  chave: string,
  feiraId: string,
): SaborPlanejado[] {
  // Uma lista salva para a data tem prioridade sobre o modelo habitual.
  if (
    Object.prototype.hasOwnProperty.call(
      planejamentos,
      chave,
    )
  ) {
    return planejamentos[chave];
  }

  return feiraId === "cerejeira"
    ? SABORES_CEREJEIRAS
    : [];
}

function dataLocalISO(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function dataDoCampo(valor: string): Date | null {
  const partes = valor.split("-").map(Number);

  if (
    partes.length !== 3 ||
    partes.some((parte) => !Number.isInteger(parte))
  ) {
    return null;
  }

  const [ano, mes, dia] = partes;
  const data = new Date(ano, mes - 1, dia);

  if (
    data.getFullYear() !== ano ||
    data.getMonth() !== mes - 1 ||
    data.getDate() !== dia
  ) {
    return null;
  }

  return data;
}

function ConferenciaSaida({
  sabores,
  registro,
  nomeFeira,
  retornoRegistrado,
  onConfirmar,
}: {
  sabores: SaborPlanejado[];
  registro?: RegistroSaida;
  nomeFeira: string;
  retornoRegistrado: boolean;
  onConfirmar: (itens: ItemSaida[]) => Promise<void>;
}) {
  const [editando, setEditando] = useState(!registro);
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(sabores.map((sabor) => [sabor.id, String(sabor.quantidade)])),
  );
  const [divergenciaRevisada, setDivergenciaRevisada] = useState(false);
  const [erroSaida, setErroSaida] = useState("");
  const [salvandoSaida, setSalvandoSaida] = useState(false);

  async function confirmar() {
    const itens = sabores.map((sabor) => ({
      saborId: sabor.id,
      nome: sabor.nome,
      previsto: sabor.quantidade,
      separado: Number(quantidades[sabor.id]),
    }));

    if (itens.some((item) =>
      quantidades[item.saborId]?.trim() === "" ||
      !Number.isSafeInteger(item.separado) || item.separado < 0
    )) {
      setErroSaida("Informe uma quantidade inteira, igual ou maior que zero, para cada sabor.");
      return;
    }

    if (itens.some((item) => item.previsto !== item.separado) && !divergenciaRevisada) {
      setErroSaida("Revise as diferenças e marque a confirmação antes de salvar.");
      return;
    }

    setSalvandoSaida(true);
    try {
      await onConfirmar(itens);
      setErroSaida("");
      setEditando(false);
    } catch (erro) {
      setErroSaida(erro instanceof Error ? erro.message : "Não foi possível confirmar a saída.");
    } finally {
      setSalvandoSaida(false);
    }
  }

  if (registro && !editando) {
    const totalSeparado = registro.itens.reduce((total, item) => total + item.separado, 0);
    return (
      <div style={{ display: "grid", gap: 10, width: "100%", padding: 14, background: "var(--color-success-light, #e5f4ea)", borderRadius: 12 }}>
        <strong>Saída conferida: {totalSeparado} pastéis</strong>
        <span style={{ fontSize: 14 }}>Por {registro.conferidoPor} em {new Date(registro.conferidoEm).toLocaleString("pt-BR")}</span>
        {registro.itens.map((item) => (
          <span key={item.saborId}>
            {nomeSabor(item.nome)}: {item.separado} separados (previstos: {item.previsto})
          </span>
        ))}
        {retornoRegistrado && <p>Para alterar a saída, será preciso corrigir primeiro o fechamento desta feira.</p>}
        <Button type="button" variant="secondary" disabled={retornoRegistrado} onClick={() => {
          setQuantidades(Object.fromEntries(sabores.map((sabor) => [
            sabor.id,
            String(registro.itens.find((item) => item.saborId === sabor.id)?.separado ?? sabor.quantidade),
          ])));
          setDivergenciaRevisada(false);
          setEditando(true);
        }}>Corrigir conferência</Button>
      </div>
    );
  }

  const temDiferenca = sabores.some((sabor) =>
    quantidades[sabor.id]?.trim() !== "" &&
    Number(quantidades[sabor.id]) !== sabor.quantidade
  );

  return (
    <div style={{ display: "grid", gap: 14, width: "100%", padding: 14, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 12 }}>
      <h5 style={{ fontSize: 16 }}>Conferir saída para {nomeFeira}</h5>
      <p>Informe o que foi colocado na pirua. Zero significa que o sabor não saiu.</p>
      {sabores.map((sabor) => (
        <label key={sabor.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span><strong>{nomeSabor(sabor.nome)}</strong><br /><small>Previstos: {sabor.quantidade}</small></span>
          <span style={{ display: "grid", gap: 4 }}>
            <span>Separados</span>
            <input type="number" min={0} step={1} inputMode="numeric"
              value={quantidades[sabor.id] ?? ""}
              onChange={(event) => {
                setQuantidades((atual) => ({ ...atual, [sabor.id]: event.target.value }));
                setDivergenciaRevisada(false);
                setErroSaida("");
              }}
              style={{ width: 100, minHeight: 48, padding: 8, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }} />
          </span>
        </label>
      ))}
      {temDiferenca && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48 }}>
          <input type="checkbox" checked={divergenciaRevisada}
            onChange={(event) => setDivergenciaRevisada(event.target.checked)}
            style={{ width: 22, height: 22, flexShrink: 0 }} />
          Conferi as diferenças entre o previsto e o separado.
        </label>
      )}
      {erroSaida && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>{erroSaida}</p>}
      <Button type="button" variant="primary" disabled={salvandoSaida} onClick={confirmar}>
        {salvandoSaida ? "Salvando..." : "Confirmar saída"}
      </Button>
      {registro && <Button type="button" variant="secondary" onClick={() => setEditando(false)}>Cancelar correção</Button>}
    </div>
  );
}

function FechamentoFeira({
  saida,
  retorno,
  nomeFeira,
  minimoAlocado,
  onConfirmar,
}: {
  saida: RegistroSaida;
  retorno?: RegistroRetorno;
  nomeFeira: string;
  minimoAlocado: Record<string, number>;
  onConfirmar: (itens: ItemRetorno[]) => Promise<void>;
}) {
  const [editando, setEditando] = useState(!retorno);
  const [sobras, setSobras] = useState<Record<string, string>>(() =>
    Object.fromEntries(saida.itens.map((item) => [item.saborId, ""])),
  );
  const [erroRetorno, setErroRetorno] = useState("");
  const [salvandoRetorno, setSalvandoRetorno] = useState(false);

  async function confirmar() {
    const itens = saida.itens.map((item) => ({
      saborId: item.saborId,
      nome: item.nome,
      separados: item.separado,
      sobraram: Number(sobras[item.saborId]),
      guardados: Number(sobras[item.saborId]),
    }));
    if (itens.some((item) =>
      sobras[item.saborId]?.trim() === "" ||
      !Number.isSafeInteger(item.sobraram) ||
      item.sobraram < 0 || item.sobraram > item.separados ||
      item.sobraram < (minimoAlocado[item.saborId] ?? 0)
    )) {
      setErroRetorno("Confira as quantidades: as sobras não podem superar a saída nem ficar abaixo do que já foi destinado a outras feiras.");
      return;
    }
    setSalvandoRetorno(true);
    try {
      await onConfirmar(itens);
      setErroRetorno("");
      setEditando(false);
    } catch (erro) {
      setErroRetorno(erro instanceof Error ? erro.message : "Não foi possível salvar o fechamento.");
    } finally {
      setSalvandoRetorno(false);
    }
  }

  if (retorno && !editando) {
    const vendidos = retorno.itens.reduce((total, item) => total + item.separados - item.sobraram, 0);
    const guardadosTotal = retorno.itens.reduce((total, item) => total + item.sobraram, 0);
    return (
      <div style={{ display: "grid", gap: 10, width: "100%", padding: 14, background: "var(--color-info-light, #e7f0fa)", borderRadius: 12 }}>
        <strong>Feira fechada · {vendidos} pastéis não retornaram · {guardadosTotal} guardados na geladeira</strong>
        <small>Não retornaram = separados − sobras. Confira vendas e perdas fora desta tela.</small>
        <span style={{ fontSize: 14 }}>Por {retorno.registradoPor} em {new Date(retorno.registradoEm).toLocaleString("pt-BR")}</span>
        {retorno.itens.map((item) => (
          <span key={item.saborId}>{nomeSabor(item.nome)}: {item.sobraram} sobraram e foram guardados</span>
        ))}
        {retorno.reaproveitado && <p>Este fechamento tem sobras destinadas a outra feira. Peça ao Dono para revisar os registros antes de corrigir.</p>}
        <Button type="button" variant="secondary" disabled={retorno.reaproveitado} onClick={() => {
          setSobras(Object.fromEntries(retorno.itens.map((item) => [item.saborId, String(item.sobraram)])));
          setEditando(true);
        }}>Corrigir fechamento</Button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14, width: "100%", padding: 14, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 12 }}>
      <h5 style={{ fontSize: 16 }}>Fechamento de {nomeFeira}</h5>
      <p>Conte os pastéis que voltaram. Todas as sobras serão guardadas na geladeira.</p>
      {saida.itens.map((item) => (
        <div key={item.saborId} style={{ display: "grid", gap: 10, paddingBlock: 10, borderBottom: "1px solid var(--color-border, #dfe5ec)" }}>
          <strong>{nomeSabor(item.nome)} · {item.separado} saíram</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>Sobraram
              <input type="number" min={0} max={item.separado} step={1} inputMode="numeric"
                value={sobras[item.saborId] ?? ""}
                placeholder="Digite a sobra"
                onChange={(event) => { setSobras((atual) => ({ ...atual, [item.saborId]: event.target.value })); setErroRetorno(""); }}
                style={{ width: 110, minHeight: 48, padding: 8, border: "1px solid var(--color-border, #dfe5ec)", borderRadius: 10 }} />
            </label>
          </div>
        </div>
      ))}
      {erroRetorno && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>{erroRetorno}</p>}
      <Button type="button" variant="primary" disabled={salvandoRetorno} onClick={confirmar}>
        {salvandoRetorno ? "Salvando..." : "Confirmar fechamento"}
      </Button>
      {retorno && <Button type="button" variant="secondary" onClick={() => setEditando(false)}>Cancelar correção</Button>}
    </div>
  );
}

export default function FeirasPage() {
  const { usuario, carregando } = useAuth();
  const router = useRouter();
  const { feirasCadastradas, erroFeirasCadastradas } = useFeirasCadastradas(usuario?.id);

  const [dataSelecionada, setDataSelecionada] = useState(
    () => dataLocalISO(new Date()),
  );
  const [responsavelSelecionado, setResponsavelSelecionado] = useState("");
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [mesVisivel, setMesVisivel] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });

  const [planejamentos, setPlanejamentos] =
    useState<Planejamentos>({});
  const [planosLocais, setPlanosLocais] = useState<Planejamentos>({});
  const [planosSincronizados, setPlanosSincronizados] = useState(false);
  const [erroSincronizacao, setErroSincronizacao] = useState("");
  const [importando, setImportando] = useState(false);
  const [saidas, setSaidas] = useState<Saidas>({});
  const [saidasLocais, setSaidasLocais] = useState<Saidas>({});
  const [saidasSincronizadas, setSaidasSincronizadas] = useState(false);
  const [erroSaidas, setErroSaidas] = useState("");
  const [importandoSaidas, setImportandoSaidas] = useState(false);
  const [saidaAberta, setSaidaAberta] = useState<string | null>(null);
  const [retornos, setRetornos] = useState<Retornos>({});
  const [retornosLocais, setRetornosLocais] = useState<Retornos>({});
  const [fechamentosSincronizados, setFechamentosSincronizados] = useState(false);
  const [erroFechamentos, setErroFechamentos] = useState("");
  const [importandoFechamentos, setImportandoFechamentos] = useState(false);
  const [reaproveitamentos, setReaproveitamentos] = useState<Reaproveitamentos>({});
  const [usosLocais, setUsosLocais] = useState<Reaproveitamentos>({});
  const [usosSincronizados, setUsosSincronizados] = useState(false);
  const [erroUsos, setErroUsos] = useState("");
  const [importandoUsos, setImportandoUsos] = useState(false);
  const [reaproveitamentoAberto, setReaproveitamentoAberto] = useState<string | null>(null);
  const [producoes, setProducoes] = useState<ProducoesFeira>({});
  const [producoesSincronizadas, setProducoesSincronizadas] = useState(false);
  const [erroProducao, setErroProducao] = useState("");
  const [producaoAberta, setProducaoAberta] = useState<string | null>(null);
  const [retornoAberto, setRetornoAberto] = useState<string | null>(null);

  const [feiraAberta, setFeiraAberta] =
    useState<string | null>(null);
  const [detalhesAbertos, setDetalhesAbertos] = useState<string | null>(null);


  useEffect(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);

      if (salvo) {
        const dados: unknown = JSON.parse(salvo);

        if (
          dados !== null &&
          typeof dados === "object" &&
          !Array.isArray(dados)
        ) {
          const planejamentosSalvos = {
            ...(dados as Planejamentos),
          };

          // Recupera dados caso o ID "Cerejeiras" tenha sido
          // usado durante o teste anterior.
          for (const chave of Object.keys(
            planejamentosSalvos,
          )) {
            if (!chave.endsWith(":Cerejeiras")) {
              continue;
            }

            const chaveEstavel = chave.replace(
              /:Cerejeiras$/,
              ":cerejeira",
            );

            if (
              !Object.prototype.hasOwnProperty.call(
                planejamentosSalvos,
                chaveEstavel,
              )
            ) {
              planejamentosSalvos[chaveEstavel] =
                planejamentosSalvos[chave];
            }

            delete planejamentosSalvos[chave];
          }

          setPlanosLocais(planejamentosSalvos);
        }
      }
    } catch {
      // Se os dados locais estiverem inválidos, a página abre
      // com a agenda habitual.
    } finally {
      try {
        const salvas: unknown = JSON.parse(localStorage.getItem("gestao-cozinha-feiras-saidas-v1") || "{}");
        if (salvas && typeof salvas === "object" && !Array.isArray(salvas)) {
          setSaidasLocais(salvas as Saidas);
        }
      } catch {
        // Se houver dados de saída inválidos, continua com a tela disponível.
      }
      try {
        const salvos: unknown = JSON.parse(localStorage.getItem("gestao-cozinha-feiras-retornos-v1") || "{}");
        if (salvos && typeof salvos === "object" && !Array.isArray(salvos)) {
          setRetornosLocais(salvos as Retornos);
        }
      } catch {
        // O fechamento pode ser preenchido normalmente nesta sessão.
      }
      try {
        const salvos: unknown = JSON.parse(localStorage.getItem("gestao-cozinha-feiras-reaproveitamentos-v1") || "{}");
        if (salvos && typeof salvos === "object" && !Array.isArray(salvos)) {
          setUsosLocais(salvos as Reaproveitamentos);
        }
      } catch {
        // O planejamento pode ser feito nesta sessão.
      }
    }
  }, []);

  useEffect(() => {
    if (carregando || !usuario) return;
    return escutarPlanejamentos(
      (remotos) => {
        setPlanejamentos(remotos);
        setPlanosSincronizados(true);
        setErroSincronizacao("");
      },
      (erro) => {
        setPlanosSincronizados(false);
        setErroSincronizacao(erro.message);
      },
    );
  }, [carregando, usuario?.id]);

  useEffect(() => {
    if (carregando || !usuario) return;
    return escutarSaidas(
      (remotas) => {
        setSaidas(remotas);
        setSaidasSincronizadas(true);
        setErroSaidas("");
      },
      (erro) => {
        setSaidasSincronizadas(false);
        setErroSaidas(erro.message);
      },
    );
  }, [carregando, usuario?.id]);

  useEffect(() => {
    if (carregando || !usuario) return;
    return escutarFechamentos(
      (remotos) => {
        setRetornos(remotos);
        setFechamentosSincronizados(true);
        setErroFechamentos("");
      },
      (erro) => {
        setFechamentosSincronizados(false);
        setErroFechamentos(erro.message);
      },
    );
  }, [carregando, usuario?.id]);

  useEffect(() => {
    if (carregando || !usuario) return;
    return escutarReaproveitamentos(
      (remotos) => {
        setReaproveitamentos(remotos);
        setUsosSincronizados(true);
        setErroUsos("");
      },
      (erro) => {
        setUsosSincronizados(false);
        setErroUsos(erro.message);
      },
    );
  }, [carregando, usuario?.id]);

  useEffect(() => {
    if (carregando || !usuario) return;
    return escutarProducaoFeiras(
      (remotos) => {
        setProducoes(remotos);
        setProducoesSincronizadas(true);
        setErroProducao("");
      },
      (erro) => {
        setProducoesSincronizadas(false);
        setErroProducao(erro.message);
      },
    );
  }, [carregando, usuario?.id]);

  async function confirmarSaida(chave: string, itens: ItemSaida[]) {
    if (!usuario?.perfis.includes("dono") && !usuario?.perfis.includes("producao")) {
      throw new Error("Seu perfil não pode conferir a saída.");
    }
    if (!saidasSincronizadas) throw new Error("Aguarde a conexão com o Firestore.");
    if (retornos[chave]) throw new Error("Corrija primeiro o fechamento desta feira.");
    await salvarSaidaFirestore(chave, itens);
  }

  async function importarSaidas() {
    if (!usuario?.perfis.includes("dono") || !saidasSincronizadas || importandoSaidas) return;
    const pendentes = Object.entries(saidasLocais).filter(([chave]) =>
      !Object.prototype.hasOwnProperty.call(saidas, chave));
    if (!window.confirm(`Importar ${pendentes.length} saída(s) antiga(s)? Os registros existentes serão preservados.`)) return;
    setImportandoSaidas(true);
    let importadas = 0;
    try {
      for (const [chave, saida] of pendentes) {
        if (await importarSaidaLocal(chave, saida)) importadas++;
      }
      window.alert(`${importadas} saída(s) importada(s). A data original foi preservada no registro.`);
    } catch (erro) {
      window.alert(`${importadas} saída(s) importada(s). Importação interrompida: ${erro instanceof Error ? erro.message : "erro inesperado"}. Os dados locais continuam neste navegador.`);
    } finally {
      setImportandoSaidas(false);
    }
  }

  async function confirmarRetorno(chave: string, itens: ItemRetorno[], versao?: string) {
    if (!usuario?.perfis.includes("dono") && !usuario?.perfis.includes("feirantes")) {
      throw new Error("Seu perfil não pode registrar o fechamento.");
    }
    if (!fechamentosSincronizados || !saidasSincronizadas) {
      throw new Error("Aguarde a conexão com o Firestore.");
    }
    await salvarFechamentoFirestore(chave, itens, versao);
  }

  async function importarFechamentos() {
    if (!usuario?.perfis.includes("dono") || !fechamentosSincronizados || importandoFechamentos) return;
    const pendentes = Object.entries(retornosLocais).filter(([chave]) =>
      !Object.prototype.hasOwnProperty.call(retornos, chave));
    if (!window.confirm(`Importar ${pendentes.length} fechamento(s) deste navegador? Confirme antes que as saídas correspondentes já estão no Firestore.`)) return;
    setImportandoFechamentos(true);
    let importados = 0;
    try {
      for (const [chave, registro] of pendentes) {
        if (await importarFechamentoLocal(chave, registro)) importados++;
      }
      window.alert(`${importados} fechamento(s) importado(s). Os dados locais foram preservados.`);
    } catch (erro) {
      window.alert(`${importados} fechamento(s) importado(s). Importação interrompida: ${erro instanceof Error ? erro.message : "erro inesperado"}. Os dados locais continuam neste navegador.`);
    } finally {
      setImportandoFechamentos(false);
    }
  }

  function abrirFeira(feiraId: string) {
    setFeiraAberta((atual) => atual === feiraId ? null : feiraId);
  }

  async function salvarPlanejamento(chave: string, itens: SaborPlanejado[]) {
    if (!usuario?.perfis.includes("dono")) throw new Error("Somente o Dono pode planejar feiras.");
    if (!planosSincronizados) throw new Error("Aguarde a conexão com o Firestore.");
    await salvarPlanejamentoFirestore(chave, itens.map((item) => ({
      ...item,
      nome: nomeSabor(item.nome),
    })));
    setFeiraAberta(null);
  }

  async function importarPlanos() {
    if (!usuario?.perfis.includes("dono") || !planosSincronizados || importando) return;
    const pendentes = Object.entries(planosLocais).filter(([chave]) =>
      !Object.prototype.hasOwnProperty.call(planejamentos, chave));
    if (!window.confirm(`Importar ${pendentes.length} planejamento(s) deste navegador? Planos existentes no Firestore serão preservados.`)) return;
    setImportando(true);
    let importados = 0;
    try {
      for (const [chave, itens] of pendentes) {
        if (await importarPlanejamentoLocal(chave, itens)) importados++;
      }
      window.alert(`${importados} planejamento(s) importado(s). Os dados locais foram preservados como cópia.`);
    } catch (erro) {
      window.alert(`${importados} planejamento(s) importado(s). Importação interrompida: ${erro instanceof Error ? erro.message : "erro inesperado"}. Os dados locais permanecem neste navegador.`);
    } finally {
      setImportando(false);
    }
  }

  async function salvarReaproveitamento(chave: string, valores: Record<string, number>) {
    if (!usuario?.perfis.includes("dono")) throw new Error("Somente o Dono pode destinar as sobras.");
    if (!usosSincronizados) throw new Error("Aguarde a conexão com o Firestore.");
    await salvarReaproveitamentoFirestore(chave, valores);
    setReaproveitamentoAberto(null);
  }

  async function importarUsos() {
    if (!usuario?.perfis.includes("dono") || !usosSincronizados || importandoUsos) return;
    const pendentes = Object.entries(usosLocais).filter(([chave]) =>
      !Object.prototype.hasOwnProperty.call(reaproveitamentos, chave));
    if (!window.confirm(`Importar ${pendentes.length} reaproveitamento(s) deste navegador? Os registros do Firestore não serão substituídos.`)) return;
    setImportandoUsos(true);
    let importados = 0;
    try {
      for (const [chave, valores] of pendentes) {
        if (await salvarReaproveitamentoFirestore(chave, valores, true)) importados++;
      }
      window.alert(`${importados} reaproveitamento(s) importado(s). Os dados locais foram preservados.`);
    } catch (erro) {
      window.alert(`${importados} reaproveitamento(s) importado(s). Importação interrompida: ${erro instanceof Error ? erro.message : "erro inesperado"}. Os dados locais continuam neste navegador.`);
    } finally {
      setImportandoUsos(false);
    }
  }

  function selecionarData(dia: number) {
    setDataSelecionada(dataLocalISO(new Date(
      mesVisivel.getFullYear(), mesVisivel.getMonth(), dia,
    )));
    setCalendarioAberto(false);
    setSaidaAberta(null);
    setRetornoAberto(null);
    setReaproveitamentoAberto(null);
    setFeiraAberta(null);
  }

  function mudarMes(diferenca: number) {
    setMesVisivel((atual) => new Date(
      atual.getFullYear(), atual.getMonth() + diferenca, 1,
    ));
  }

  if (carregando || !usuario) {
    return null;
  }

  if (!planosSincronizados || !saidasSincronizadas || !fechamentosSincronizados || !usosSincronizados || !producoesSincronizadas) {
    return (
      <AppLayout user={usuario} title="Feiras" subtitle="Planeje os pastéis de cada feira.">
        <div className={styles.page} role="status">
          {erroSincronizacao || erroSaidas || erroFechamentos || erroUsos || erroProducao || "Carregando feiras do Firestore..."}
        </div>
      </AppLayout>
    );
  }

  const podeConferirSaida = usuario.perfis.includes("dono") || usuario.perfis.includes("producao");
  const podeFecharFeira = usuario.perfis.includes("dono") || usuario.perfis.includes("feirantes");
  const modoFuncionario = usuario.perfis.includes("feirantes");
  const podePlanejar = usuario.perfis.includes("dono");
  const modoConsulta = usuario.perfis.includes("producao") || modoFuncionario;

  const anoVisivel = mesVisivel.getFullYear();
  const mesIndice = mesVisivel.getMonth();
  const diasNoMes = new Date(anoVisivel, mesIndice + 1, 0).getDate();
  const deslocamento = new Date(anoVisivel, mesIndice, 1).getDay();
  const hojeISO = dataLocalISO(new Date());
  const nomeMes = new Intl.DateTimeFormat("pt-BR", {
    month: "long", year: "numeric",
  }).format(mesVisivel);
  const data = dataDoCampo(dataSelecionada);
  const feiras = data ? feirasDaData(dataSelecionada, feirasCadastradas) : [];
  const responsaveisDoDia = Array.from(
    new Set(feiras.flatMap((feira) => feira.responsaveis.map((nome) => nome.trim()).filter(Boolean))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const feirasVisiveis = responsavelSelecionado
    ? feiras.filter((feira) => feira.responsaveis.some(
        (nome) => nomeNormalizado(nome) === nomeNormalizado(responsavelSelecionado),
      ))
    : feiras;
  const idsRepetidos = Array.from(
    new Set(feiras.filter((feira, indice) =>
      feiras.findIndex((outra) => outra.id === feira.id) !== indice,
    ).map((feira) => feira.id)),
  );

  const dataFormatada = data
    ? new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(data)
    : "";

  const sobrasAnteriores = Object.entries(retornos)
    .filter(([chave]) => chave.split(":")[0] < dataSelecionada)
    .flatMap(([chave, retorno]) =>
      retorno.itens.filter((item) => item.sobraram > 0).map((item) => {
        const [dataOrigem, feiraId] = chave.split(":");
        const nomeFeira = nomeDaFeira(feiraId, feirasCadastradas);
        return {
          id: `${chave}:${item.saborId}`,
          data: dataOrigem,
          feira: nomeFeira,
          sabor: item.nome,
          quantidade: item.sobraram,
        };
      }),
    )
    .sort((a, b) => b.data.localeCompare(a.data));
  const totalSobrasAnteriores = sobrasAnteriores.reduce(
    (total, sobra) => total + sobra.quantidade, 0,
  );
  const temImportacoesAntigas = usuario.perfis.includes("dono") && (
    Object.keys(usosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(reaproveitamentos, chave)) ||
    Object.keys(retornosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(retornos, chave)) ||
    Object.keys(planosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(planejamentos, chave)) ||
    Object.keys(saidasLocais).some((chave) => !Object.prototype.hasOwnProperty.call(saidas, chave))
  );

  return (
    <AppLayout
      user={usuario}
      title="Feiras"
      subtitle="Planeje os pastéis de cada feira."
      headerActions={podePlanejar ? (
        <>
          <Button type="button" variant="secondary"
            onClick={() => router.push("/feiras/gerenciar")}>
            Gerenciar feiras
          </Button>
          <Button type="button" variant="primary"
            onClick={() => router.push("/feiras/cadastrar")}>
            Cadastrar feira
          </Button>
        </>
      ) : undefined}
    >
      <div className={styles.page}>
        {erroFeirasCadastradas && (
          <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>
            {erroFeirasCadastradas}
          </p>
        )}
        {temImportacoesAntigas && (
          <details className={styles.importPanel}>
            <summary>Importar dados antigos deste navegador</summary>
            <p>Use estas opções somente se houver registros antigos para recuperar.</p>
            <div className={styles.importActions}>
          {usuario.perfis.includes("dono") &&
            Object.keys(usosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(reaproveitamentos, chave)) && (
              <Button className={styles.importButton} type="button" variant="secondary" disabled={importandoUsos} onClick={importarUsos}>
                {importandoUsos ? "Importando usos..." : "Importar reaproveitamentos antigos deste navegador"}
              </Button>
            )}
          {usuario.perfis.includes("dono") &&
            Object.keys(retornosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(retornos, chave)) && (
              <Button className={styles.importButton} type="button" variant="secondary" disabled={importandoFechamentos} onClick={importarFechamentos}>
                {importandoFechamentos ? "Importando fechamentos..." : "Importar fechamentos antigos deste navegador"}
              </Button>
            )}
          {usuario.perfis.includes("dono") &&
            Object.keys(planosLocais).some((chave) => !Object.prototype.hasOwnProperty.call(planejamentos, chave)) && (
              <Button className={styles.importButton} type="button" variant="secondary" disabled={importando} onClick={importarPlanos}>
                {importando ? "Importando..." : "Importar planejamentos antigos deste navegador"}
              </Button>
            )}
          {usuario.perfis.includes("dono") &&
            Object.keys(saidasLocais).some((chave) => !Object.prototype.hasOwnProperty.call(saidas, chave)) && (
              <Button className={styles.importButton} type="button" variant="secondary" disabled={importandoSaidas} onClick={importarSaidas}>
                {importandoSaidas ? "Importando saídas..." : "Importar saídas antigas deste navegador"}
              </Button>
            )}
            </div>
          </details>
        )}
        {!modoFuncionario && sobrasAnteriores.length > 0 && (
          <details className={styles.sobrasPanel}>
            <summary className={styles.sobrasSummary}>
              <span><strong>Sobras de feiras anteriores</strong><small>Consulte os sabores, a data e a feira de origem</small></span>
              <span className={styles.sobrasBadge}>{totalSobrasAnteriores} pastéis registrados · {sobrasAnteriores.length} itens</span>
            </summary>
            <div className={styles.sobrasContent}>
            <p>Confira a origem antes de planejar o reaproveitamento. Este resumo não desconta pastéis do saldo.</p>
            <ul className={styles.sobrasList}>
              {sobrasAnteriores.map((sobra) => (
                <li key={sobra.id} className={styles.sobraItem}>
                  <strong>{nomeSabor(sobra.sabor)}</strong>
                  <span>{sobra.quantidade} pastéis</span>
                  <small>{sobra.feira} · {sobra.data.split("-").reverse().join("/")}</small>
                </li>
              ))}
            </ul>
            </div>
          </details>
        )}
        <section className={styles.intro} style={{ alignItems: "flex-start" }}>
          <div>
            <h2>{modoConsulta ? (dataSelecionada === hojeISO ? "Feiras de hoje" : "Feiras da data selecionada") : "Saídas programadas"}</h2>
            <p>
              {modoFuncionario ? "Consulte as bandejas separadas para sua feira e registre as sobras no final." : usuario.perfis.includes("producao") ? "Prepare os pastéis e confira as quantidades separadas para cada feira." : "Escolha uma data e informe a quantidade prevista por sabor em cada feira."}
            </p>
          </div>

          <div
            className={styles.dateField}
            role="group"
            aria-label="Data da feira"
            style={{ minWidth: 0, width: "min(100%, 330px)", alignSelf: "flex-start" }}
          >
            <span style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>{modoFuncionario ? "Consultar outra data" : "Data da feira"}</span>
            <button
              type="button"
              aria-expanded={calendarioAberto}
              aria-controls="calendario-feiras"
              onClick={() => setCalendarioAberto((aberto) => !aberto)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", minHeight: 48, padding: "8px 12px", background: "var(--color-surface, white)", color: "var(--color-text-primary, #17243a)", border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 10, font: "inherit", fontWeight: 600, cursor: "pointer" }}
            >
              <span>{dataSelecionada.split("-").reverse().join("/")}</span>
              <CalendarDays size={20} aria-hidden="true" />
            </button>
            {calendarioAberto && (
              <div id="calendario-feiras" onKeyDown={(event) => {
                if (event.key === "Escape") setCalendarioAberto(false);
              }} style={{ marginTop: 12, padding: 12, border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 12, background: "var(--color-surface, white)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior"
                style={{ minWidth: 44, minHeight: 44, border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 10, background: "var(--color-surface, white)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <ChevronLeft size={22} aria-hidden="true" />
              </button>
              <strong aria-live="polite" style={{ textTransform: "capitalize", textAlign: "center" }}>{nomeMes}</strong>
              <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês"
                style={{ minWidth: 44, minHeight: 44, border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 10, background: "var(--color-surface, white)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <ChevronRight size={22} aria-hidden="true" />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3, textAlign: "center" }}>
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((dia) => (
                <span key={dia} style={{ fontSize: 12, fontWeight: 700, paddingBlock: 5 }}>{dia}</span>
              ))}
              {Array.from({ length: deslocamento }, (_, index) => (
                <span key={`vazio-${index}`} aria-hidden="true" />
              ))}
              {Array.from({ length: diasNoMes }, (_, index) => {
                const dia = index + 1;
                const dataDia = dataLocalISO(new Date(anoVisivel, mesIndice, dia));
                const selecionado = dataDia === dataSelecionada;
                const ehHoje = dataDia === hojeISO;
                const nomeDia = new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "full",
                }).format(new Date(anoVisivel, mesIndice, dia));
                return (
                  <button
                    key={dataDia}
                    type="button"
                    onClick={() => selecionarData(dia)}
                    aria-label={nomeDia}
                    aria-pressed={selecionado}
                    title={feirasDaData(dataDia, feirasCadastradas).map((feira) => feira.nome).join(", ") || "Sem feira programada"}
                    style={{ minWidth: 0, minHeight: 44, padding: 0, borderRadius: 9, cursor: "pointer", font: "inherit", fontWeight: selecionado || ehHoje ? 700 : 400, border: ehHoje && !selecionado ? "2px solid var(--color-primary, #1e3a5f)" : "1px solid transparent", background: selecionado ? "var(--color-primary, #1e3a5f)" : "transparent", color: selecionado ? "white" : "inherit" }}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => {
              const hoje = new Date();
              setMesVisivel(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
              setDataSelecionada(dataLocalISO(hoje));
              setCalendarioAberto(false);
              setSaidaAberta(null);
              setRetornoAberto(null);
              setReaproveitamentoAberto(null);
              setFeiraAberta(null);
              setDetalhesAbertos(null);
                      }} style={{ minHeight: 44, marginTop: 6, paddingInline: 12, background: "transparent", color: "var(--color-primary, #1e3a5f)", border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 10, font: "inherit", cursor: "pointer" }}>
              Ir para hoje
            </button>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="titulo-dia">
          <h3
            id="titulo-dia"
            className={styles.dayTitle}
          >
            <CalendarDays
              size={22}
              aria-hidden="true"
            />
            {dataFormatada ||
              "Selecione uma data"}
          </h3>

          {feiras.length > 0 && (
            <label style={{ display: "grid", gap: 8, width: "min(100%, 330px)", marginBottom: 16, fontWeight: 600 }}>
              Responsável
              <select
                value={responsavelSelecionado}
                onChange={(event) => setResponsavelSelecionado(event.target.value)}
                style={{ minHeight: 48, padding: "8px 12px", border: "1px solid var(--color-border, #d8e2ee)", borderRadius: 10, background: "var(--color-surface, white)", color: "var(--color-text-primary, #17243a)", font: "inherit" }}
              >
                <option value="">Todos os responsáveis ({feiras.length} feiras)</option>
                {responsaveisDoDia.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            </label>
          )}

          {idsRepetidos.length > 0 && (
            <p role="alert" style={{ marginBottom: 16, color: "var(--color-danger, #b42318)" }}>
              Há feiras com o mesmo identificador ({idsRepetidos.join(", ")}).
              Cadastre cada feira separadamente para manter planejamentos independentes.
            </p>
          )}

          {feiras.length === 0 ? (
            <div className={styles.empty}>
              Nenhuma feira ou evento programado
              para este dia.
            </div>
          ) : feirasVisiveis.length === 0 ? (
            <div className={styles.empty}>
              Nenhuma feira deste responsável nesta data. Selecione “Todos os responsáveis”.
            </div>
          ) : (
            <div className={styles.grid}>
              {feirasVisiveis.map((feira) => {
                const chave = chaveDaFeira(
                  dataSelecionada,
                  feira.id,
                );

                const sabores = saboresDaFeira(
                  planejamentos,
                  chave,
                  feira.id,
                );

                const total = sabores.reduce(
                  (soma, sabor) =>
                    soma + sabor.quantidade,
                  0,
                );

                const aberta =
                  feiraAberta === feira.id;
                const registroSaida = saidas[chave];
                const saidaDesatualizada = Boolean(registroSaida) && (
                  registroSaida.itens.length !== sabores.length ||
                  sabores.some((sabor) => !registroSaida.itens.some((item) =>
                    item.saborId === sabor.id && item.previsto === sabor.quantidade,
                  ))
                );
                const conferenciaAberta = saidaAberta === chave;
                const registroRetorno = retornos[chave];
                const fechamentoAberto = retornoAberto === chave;
                const usoDaFeira = reaproveitamentos[chave] ?? {};
                const totaisReaproveitados = sabores.map((sabor) => ({
                  nome: sabor.nome,
                  previsto: sabor.quantidade,
                  usado: Object.entries(usoDaFeira).reduce((soma, [origem, quantidade]) => {
                    const separador = origem.lastIndexOf("|");
                    const origemChave = origem.slice(0, separador);
                    const saborOrigemId = origem.slice(separador + 1);
                    const item = retornos[origemChave]?.itens.find((candidato) => candidato.saborId === saborOrigemId);
                    return soma + (item && nomeNormalizado(item.nome) === nomeNormalizado(sabor.nome) ? quantidade : 0);
                  }, 0),
                }));
                const usoInvalido = totaisReaproveitados.some((item) => item.usado > item.previsto) ||
                  Object.entries(usoDaFeira).some(([origem, quantidade]) => {
                    const separador = origem.lastIndexOf("|");
                    const origemChave = origem.slice(0, separador);
                    const item = retornos[origemChave]?.itens.find((candidato) => candidato.saborId === origem.slice(separador + 1));
                    const destinado = Object.values(reaproveitamentos).reduce((soma, destino) => soma + (destino[origem] ?? 0), 0);
                    return !item || quantidade < 0 || destinado > item.sobraram ||
                      !sabores.some((sabor) => nomeNormalizado(sabor.nome) === nomeNormalizado(item.nome));
                  });
                const registrosDaFeira = producoes[chave] ?? [];
                const limitePorSabor = Object.fromEntries(sabores.map((sabor) => [
                  sabor.id,
                  Math.max(0, sabor.quantidade - (totaisReaproveitados.find((item) => item.nome === sabor.nome)?.usado ?? 0)),
                ]));
                const minimoAlocado = Object.fromEntries((registroRetorno?.itens ?? []).map((item) => [
                  item.saborId,
                  Object.values(reaproveitamentos).reduce((soma, destino) => soma + (destino[chaveDaSobra(chave, item.saborId)] ?? 0), 0),
                ]));

                return (
                  <article
                    key={feira.id}
                    className={styles.card}
                  >
                    <span className={styles.tag}>
                      {feira.turno ??
                        "Horário a definir"}
                    </span>

                    <h4>
                      <MapPin
                        size={22}
                        aria-hidden="true"
                      />
                      {feira.nome}
                    </h4>

                    <p>
                      <Users
                        size={18}
                        aria-hidden="true"
                      />
                      <span>
                        {feira.responsaveis.join(
                          " e ",
                        )}
                      </span>
                    </p>

                    <strong>
                      {sabores.length === 0
                        ? "Nenhum sabor planejado"
                        : `${total} pastéis previstos em ${sabores.length} sabores`}
                    </strong>
                    {modoConsulta && sabores.length > 0 && (
                      <>
                        <Button type="button" variant="secondary"
                          aria-expanded={detalhesAbertos === chave}
                          aria-controls={`sabores-${feira.id}`}
                          onClick={() => setDetalhesAbertos((atual) => atual === chave ? null : chave)}>
                          {detalhesAbertos === chave ? "Ocultar sabores" : "Ver sabores e quantidades"}
                        </Button>
                        {detalhesAbertos === chave && (
                          <ul id={`sabores-${feira.id}`} style={{ width: "100%", margin: 0, padding: 0, listStyle: "none" }}>
                            {sabores.map((sabor) => (
                              <li key={sabor.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
                                <span>{nomeSabor(sabor.nome)}</span><strong>{sabor.quantidade}</strong>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                    {!modoFuncionario && totaisReaproveitados.some((item) => item.usado > 0) && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>Da geladeira / a preparar</strong>
                        {totaisReaproveitados.filter((item) => item.usado > 0).map((item) => (
                          <span key={item.nome}>{nomeSabor(item.nome)}: {item.usado} da geladeira + {item.previsto - item.usado} a preparar = {item.previsto} previstos</span>
                        ))}
                      </div>
                    )}
                    {sabores.length > 0 && registrosDaFeira.length > 0 && (
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong>Produção registrada</strong>
                        {sabores.map((sabor) => {
                          const registros = registrosDaFeira.filter((item) => item.saborId === sabor.id);
                          const totalProduzido = registros.reduce((soma, item) => soma + item.quantidade, 0);
                          if (registros.length === 0) return null;
                          return <span key={sabor.id}>{nomeSabor(sabor.nome)}: {totalProduzido} de {limitePorSabor[sabor.id]} a preparar
                            {registros.filter((item) => item.quantidade > 0).length > 0 &&
                              ` · ${registros.filter((item) => item.quantidade > 0).map((item) => `${item.funcionario}: ${item.quantidade}`).join(", ")}`}
                          </span>;
                        })}
                      </div>
                    )}
                    {usoInvalido && <p role="alert" style={{ color: "var(--color-danger, #b42318)" }}>Revise o reaproveitamento: o saldo ou o planejamento desta feira mudou.</p>}

                    {registroSaida && (
                      <span role="status" style={{ color: "var(--color-success, #158a4b)", fontWeight: 700 }}>
                        Saída conferida: {registroSaida.itens.reduce((total, item) => total + item.separado, 0)} pastéis
                      </span>
                    )}
                    {saidaDesatualizada && (
                      <p role="status" style={{ color: "var(--color-warning, #a85b00)" }}>
                        O planejamento mudou. Corrija e confirme a saída antes de fechar a feira.
                      </p>
                    )}
                    {registroRetorno && (
                      <span role="status" style={{ color: "var(--color-info, #2b6cb0)", fontWeight: 700 }}>
                        Feira fechada: {registroRetorno.itens.reduce((total, item) => total + item.sobraram, 0)} pastéis guardados
                      </span>
                    )}

                    {podePlanejar && <Button
                      type="button"
                      variant="secondary"
                      aria-expanded={aberta}
                      aria-controls={
                        aberta
                          ? `planejamento-${feira.id}`
                          : undefined
                      }
                      onClick={() =>
                        abrirFeira(feira.id)
                      }
                    >
                      {aberta
                        ? "Fechar planejamento"
                        : "Planejar pastéis"}
                    </Button>}

                    {podePlanejar && aberta && (
                      <div id={`planejamento-${feira.id}`} style={{ width: "100%" }}>
                        <PlanejadorSabores
                          key={chave}
                          sabores={sabores}
                          bloqueado={Boolean(registroRetorno)}
                          onSalvar={(itens) => salvarPlanejamento(chave, itens)}
                        />
                      </div>
                    )}

                    {podePlanejar && !registroSaida && (sabores.length > 0 || Object.keys(usoDaFeira).length > 0) && (
                      <Button type="button" variant="secondary" aria-expanded={reaproveitamentoAberto === chave}
                        aria-controls={reaproveitamentoAberto === chave ? `reaproveitamento-${feira.id}` : undefined}
                        onClick={() => setReaproveitamentoAberto((atual) => atual === chave ? null : chave)}>
                        {reaproveitamentoAberto === chave ? "Fechar reaproveitamento" : "Usar pastéis da geladeira"}
                      </Button>
                    )}
                    {podePlanejar && !registroSaida && reaproveitamentoAberto === chave && (
                      <div id={`reaproveitamento-${feira.id}`} style={{ width: "100%" }}>
                        <ReaproveitamentoFeira key={chave} chaveDestino={chave} sabores={sabores} retornos={retornos}
                          usos={reaproveitamentos} feirasCadastradas={feirasCadastradas}
                          onSalvar={(valores) => salvarReaproveitamento(chave, valores)} />
                      </div>
                    )}

                    {(usuario.perfis.includes("dono") || usuario.perfis.includes("producao")) && sabores.length > 0 && !registroSaida && (
                      <Button type="button" variant="secondary" aria-expanded={producaoAberta === chave}
                        onClick={() => setProducaoAberta((atual) => atual === chave ? null : chave)}>
                        {producaoAberta === chave ? "Fechar produção" : "Registrar produção"}
                      </Button>
                    )}
                    {(usuario.perfis.includes("dono") || usuario.perfis.includes("producao")) &&
                      producaoAberta === chave && !registroSaida && (
                        <RegistroProducaoFeira key={chave} sabores={sabores} registros={registrosDaFeira}
                          usuarioId={usuario.id} limitePorSabor={limitePorSabor}
                          onSalvar={(saborId, quantidade) => salvarProducaoFeira(chave, saborId, quantidade, usuario.nome)} />
                    )}

                    {podeConferirSaida && sabores.length > 0 && (
                      <Button
                        type="button"
                        variant={!registroSaida ? "primary" : "secondary"}
                        aria-expanded={conferenciaAberta}
                        aria-controls={conferenciaAberta ? `saida-${feira.id}` : undefined}
                        onClick={() => {
                          setSaidaAberta((atual) => atual === chave ? null : chave);
                          setFeiraAberta(null);
                        }}
                      >
                        {conferenciaAberta ? "Fechar conferência" : registroSaida ? "Ver saída conferida" : "Conferir saída"}
                      </Button>
                    )}
                    {podeConferirSaida && conferenciaAberta && sabores.length > 0 && (
                      <div id={`saida-${feira.id}`} style={{ width: "100%" }}>
                        <ConferenciaSaida
                          key={chave}
                          nomeFeira={feira.nome}
                          sabores={sabores}
                          registro={registroSaida}
                          retornoRegistrado={Boolean(registroRetorno)}
                          onConfirmar={(itens) => confirmarSaida(chave, itens)}
                        />
                      </div>
                    )}
                    {modoFuncionario && registroSaida && (
                      <div style={{ display: "grid", gap: 4, width: "100%" }}>
                        <strong>Bandejas separadas pela Produção</strong>
                        <small>Conferidas por {registroSaida.conferidoPor} em {new Date(registroSaida.conferidoEm).toLocaleString("pt-BR")}</small>
                        {registroSaida.itens.map((item) => (
                          <span key={item.saborId}>{nomeSabor(item.nome)}: {item.separado} pastéis</span>
                        ))}
                      </div>
                    )}
                    {registroSaida && !saidaDesatualizada && !usoInvalido && podeFecharFeira && (
                      <Button type="button" variant={modoFuncionario && !registroRetorno ? "primary" : "secondary"}
                        aria-expanded={fechamentoAberto}
                        aria-controls={fechamentoAberto ? `retorno-${feira.id}` : undefined}
                        onClick={() => {
                          setRetornoAberto((atual) => atual === chave ? null : chave);
                          setSaidaAberta(null);
                          setFeiraAberta(null);
                        }}
                      >
                        {fechamentoAberto ? "Fechar contagem" : registroRetorno ? "Ver fechamento" : "Contar sobras da feira"}
                      </Button>
                    )}
                    {registroSaida && !saidaDesatualizada && !usoInvalido && podeFecharFeira && fechamentoAberto && (
                      <div id={`retorno-${feira.id}`} style={{ width: "100%" }}>
                        <FechamentoFeira
                          key={chave}
                          nomeFeira={feira.nome}
                          saida={registroSaida}
                          retorno={registroRetorno}
                          minimoAlocado={minimoAlocado}
                          onConfirmar={(itens) => confirmarRetorno(chave, itens, registroRetorno?.registradoEm)}
                        />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
