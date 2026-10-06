"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Search,
  Barcode,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Wine,
  HelpCircle,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usuarioEstoque } from "@/services/usuarios";
import { firebaseClient } from "@/lib/firebase";

import styles from "./page.module.css";

type Bebida = {
  id: string;
  nome: string;
  volume: string;
  codigo: string;
  saldo: number;
  fardo: number;
  minimo: number;
};

type Movimentacao = {
  id: string;
  bebidaId: string;
  bebidaNome: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  saldoNovo: number;
  registradoPor: string;
  registradoEm: string | null;
};

type EstoqueBar = {
  bebidas: Bebida[];
  movimentacoes: Movimentacao[];
};

type ResultadoMovimentacao = {
  ok: boolean;
  saldo: number;
  nome: string;
  repetida: boolean;
};

type ResultadoCadastro = {
  ok: boolean;
  bebida: Bebida;
  repetida: boolean;
};

type Tela =
  | "inicio"
  | "selecionar"
  | "quantidade"
  | "conferir"
  | "cadastro";

type Operacao = "entrada" | "saida";

type OperacaoPendente = {
  chave: string;
  id: string;
};

const inteiro = (numero: number, minimo = 1) =>
  Number.isSafeInteger(numero) && numero >= minimo;

function mensagemErro(falha: unknown) {
  return falha instanceof Error
    ? falha.message
    : "Não foi possível concluir a operação.";
}

async function requisitar<T>(
  uid: string,
  corpo?: Record<string, unknown>,
): Promise<T> {
  const { auth } = firebaseClient();
  const usuario = auth.currentUser;

  if (!usuario || usuario.uid !== uid) {
    throw new Error("Sua sessão mudou. Entre novamente.");
  }

  const token = await usuario.getIdToken();

  if (auth.currentUser?.uid !== uid) {
    throw new Error("Sua sessão mudou. Entre novamente.");
  }

  const resposta = await fetch("/api/bar", {
    method: corpo ? "POST" : "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });

  const dados = await resposta.json();

  if (!resposta.ok) {
    throw new Error(
      typeof dados?.erro === "string"
        ? dados.erro
        : "Não foi possível acessar o estoque do bar.",
    );
  }

  return dados as T;
}

function textoMovimentacao(movimento: Movimentacao) {
  const tipo = movimento.tipo === "entrada" ? "Entrada" : "Saída";

  return `${tipo} de ${movimento.quantidade} unidades de ${movimento.bebidaNome}. Saldo: ${movimento.saldoNovo} unidades.`;
}

export default function BarPage() {
  const [bebidas, setBebidas] = useState<Bebida[]>([]);
  const [historico, setHistorico] = useState<Movimentacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

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

  const tituloRef = useRef<HTMLHeadingElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const primeiraRenderizacao = useRef(true);

  const versao = useRef(0);
  const ultimaConsulta = useRef(0);
  const bloqueado = useRef(false);
  const pendente = useRef<OperacaoPendente | null>(null);

  const produto = bebidas.find((bebida) => bebida.id === selecionadaId);

  const total =
    embalagem === "fardo"
      ? Number(quantidade) * Number(porFardo) + Number(avulsas)
      : Number(quantidade);

  const saldoDepois = produto
    ? produto.saldo + (operacao === "entrada" ? total : -total)
    : 0;

  const termo = busca.trim().toLocaleLowerCase("pt-BR");

  const filtradas = bebidas.filter(
    (bebida) =>
      `${bebida.nome} ${bebida.volume}`
        .toLocaleLowerCase("pt-BR")
        .includes(termo) ||
      (bebida.codigo !== "" && bebida.codigo === termo),
  );

  const titulo =
    tela === "inicio"
      ? "O que você precisa fazer?"
      : tela === "selecionar"
        ? "Qual bebida?"
        : tela === "quantidade"
          ? "Informe a quantidade"
          : tela === "conferir"
            ? "Confira antes de confirmar"
            : "Cadastrar bebida";

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }

    tituloRef.current?.focus();
  }, [tela]);

  useEffect(() => {
    const { auth } = firebaseClient();
    let ativo = true;

    const cancelar = onAuthStateChanged(auth, (usuario) => {
      const atual = ++versao.current;
      const consulta = ++ultimaConsulta.current;

      bloqueado.current = false;
      pendente.current = null;

      setBebidas([]);
      setHistorico([]);
      setTela("inicio");
      setSelecionadaId("");
      setMensagem("");
      setErro("");
      setSalvando(false);
      setPronto(false);
      setCarregando(Boolean(usuario));

      if (!usuario) {
        setErro("Entre com um perfil de Dono ou Administração.");
        return;
      }

      void requisitar<EstoqueBar>(usuario.uid)
        .then((dados) => {
          if (
            !ativo ||
            versao.current !== atual ||
            ultimaConsulta.current !== consulta ||
            auth.currentUser?.uid !== usuario.uid
          ) {
            return;
          }

          setBebidas(dados.bebidas);
          setHistorico(dados.movimentacoes);
          setPronto(true);
        })
        .catch((falha: unknown) => {
          if (
            ativo &&
            versao.current === atual &&
            ultimaConsulta.current === consulta
          ) {
            setErro(mensagemErro(falha));
          }
        })
        .finally(() => {
          if (
            ativo &&
            versao.current === atual &&
            ultimaConsulta.current === consulta
          ) {
            setCarregando(false);
          }
        });
    });

    return () => {
      ativo = false;
      versao.current += 1;
      ultimaConsulta.current += 1;
      cancelar();
    };
  }, []);

  function navegar(proxima: Tela) {
    if (bloqueado.current) return;

    setErro("");
    setTela(proxima);
  }

  function iniciar(tipo: Operacao) {
    if (!pronto || bloqueado.current) return;

    setOperacao(tipo);
    setBusca("");
    setMensagem("");
    navegar("selecionar");
  }

  function selecionar(bebida: Bebida, tipo = operacao) {
    if (!pronto || bloqueado.current) return;

    setSelecionadaId(bebida.id);
    setOperacao(tipo);
    setQuantidade("1");
    setPorFardo(String(bebida.fardo));
    setAvulsas("0");
    setEmbalagem("unidade");
    setMensagem("");
    navegar("quantidade");
  }

  function validar(): string {
    if (!pronto) return "Carregue o estoque antes de continuar.";
    if (!produto) return "Escolha uma bebida para continuar.";

    if (!inteiro(Number(quantidade))) {
      return "Informe uma quantidade inteira maior que zero.";
    }

    if (
      embalagem === "fardo" &&
      (!inteiro(Number(porFardo)) ||
        avulsas.trim() === "" ||
        !inteiro(Number(avulsas), 0))
    ) {
      return "Confira as unidades por fardo e as unidades avulsas. Use números inteiros.";
    }

    if (!inteiro(total) || total > 1_000_000) {
      return "Informe um total entre 1 e 1.000.000 de unidades.";
    }

    if (!inteiro(saldoDepois, 0)) {
      return operacao === "saida"
        ? "A saída não pode ser maior que o saldo disponível."
        : "Quantidade muito grande. Confira os números.";
    }

    if (saldoDepois > 1_000_000_000) {
      return "O saldo calculado ultrapassa o limite permitido.";
    }

    return "";
  }

  function conferir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bloqueado.current) return;

    const falha = validar();

    if (falha) {
      setErro(falha);
      return;
    }

    navegar("conferir");
  }

  function identificadorOperacao(chave: string) {
    if (pendente.current?.chave !== chave) {
      pendente.current = {
        chave,
        id: crypto.randomUUID(),
      };
    }

    return pendente.current.id;
  }

  async function atualizar() {
    const uid = firebaseClient().auth.currentUser?.uid;
    if (!uid || bloqueado.current) return;

    const atual = versao.current;
    const consulta = ++ultimaConsulta.current;

    setCarregando(true);
    setErro("");

    try {
      const dados = await requisitar<EstoqueBar>(uid);

      if (
        versao.current !== atual ||
        ultimaConsulta.current !== consulta ||
        firebaseClient().auth.currentUser?.uid !== uid
      ) {
        return;
      }

      setBebidas(dados.bebidas);
      setHistorico(dados.movimentacoes);
      setPronto(true);
    } catch (falha) {
      if (
        versao.current === atual &&
        ultimaConsulta.current === consulta
      ) {
        setErro(mensagemErro(falha));
      }
    } finally {
      if (
        versao.current === atual &&
        ultimaConsulta.current === consulta
      ) {
        setCarregando(false);
      }
    }
  }

  async function confirmar() {
    if (bloqueado.current) return;

    const falha = validar();

    if (falha || !produto) {
      setErro(falha || "Escolha uma bebida.");
      return;
    }

    const uid = firebaseClient().auth.currentUser?.uid;

    if (!uid) {
      setErro("Sua sessão terminou. Entre novamente.");
      return;
    }

    const bebida = produto;
    const tipo = operacao;
    const unidades = total;
    const atual = versao.current;

    const operacaoId = identificadorOperacao(
      JSON.stringify({
        acao: "movimentar",
        uid,
        bebidaId: bebida.id,
        tipo,
        quantidade: unidades,
      }),
    );

    bloqueado.current = true;
    setSalvando(true);
    setErro("");

    try {
      const resultado = await requisitar<ResultadoMovimentacao>(uid, {
        acao: "movimentar",
        operacaoId,
        bebidaId: bebida.id,
        tipo,
        quantidade: unidades,
      });

      if (
        versao.current !== atual ||
        firebaseClient().auth.currentUser?.uid !== uid
      ) {
        return;
      }

      setBebidas((lista) =>
        lista.map((item) =>
          item.id === bebida.id
            ? { ...item, saldo: resultado.saldo }
            : item,
        ),
      );

      const movimento: Movimentacao = {
        id: operacaoId,
        bebidaId: bebida.id,
        bebidaNome: resultado.nome,
        tipo,
        quantidade: unidades,
        saldoNovo: resultado.saldo,
        registradoPor: "",
        registradoEm: null,
      };

      setHistorico((lista) =>
        [
          movimento,
          ...lista.filter((item) => item.id !== operacaoId),
        ].slice(0, 30),
      );

      setMensagem(textoMovimentacao(movimento));
      setTela("inicio");
      pendente.current = null;
    } catch (falha) {
      if (versao.current === atual) {
        setErro(mensagemErro(falha));
      }
    } finally {
      if (versao.current === atual) {
        bloqueado.current = false;
        setSalvando(false);
      }
    }
  }

  async function cadastrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bloqueado.current || !pronto) return;

    const dados = new FormData(event.currentTarget);

    const nome = String(dados.get("nome") ?? "").trim();
    const volume = String(dados.get("volume") ?? "").trim();
    const codigo = String(dados.get("codigo") ?? "").trim();
    const fardo = Number(dados.get("fardo"));
    const minimo = Number(dados.get("minimo"));

    if (
      nome.length < 2 ||
      nome.length > 80 ||
      volume.length < 2 ||
      volume.length > 60 ||
      !inteiro(fardo) ||
      fardo > 10000 ||
      !inteiro(minimo, 0) ||
      minimo > 1_000_000
    ) {
      setErro(
        "Confira nome, embalagem, unidades por fardo e estoque mínimo.",
      );
      return;
    }

    if (codigo && !/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(codigo)) {
      setErro(
        "Digite os 8, 12, 13 ou 14 números do código, ou deixe em branco.",
      );
      return;
    }

    const uid = firebaseClient().auth.currentUser?.uid;

    if (!uid) {
      setErro("Sua sessão terminou. Entre novamente.");
      return;
    }

    const atual = versao.current;

    const operacaoId = identificadorOperacao(
      JSON.stringify({
        acao: "cadastrar",
        uid,
        nome,
        volume,
        codigo,
        fardo,
        minimo,
      }),
    );

    bloqueado.current = true;
    setSalvando(true);
    setErro("");

    try {
      const resultado = await requisitar<ResultadoCadastro>(uid, {
        acao: "cadastrar",
        operacaoId,
        nome,
        volume,
        codigo,
        fardo,
        minimo,
      });

      if (
        versao.current !== atual ||
        firebaseClient().auth.currentUser?.uid !== uid
      ) {
        return;
      }

      setBebidas((lista) =>
        [
          ...lista.filter((item) => item.id !== resultado.bebida.id),
          resultado.bebida,
        ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );

      setMensagem(
        resultado.repetida
          ? `${nome} já foi cadastrada por esta operação.`
          : `${nome} cadastrada com saldo zero. Use Receber para adicionar unidades.`,
      );

      setBusca("");
      setTela("inicio");
      pendente.current = null;
    } catch (falha) {
      if (versao.current === atual) {
        setErro(mensagemErro(falha));
      }
    } finally {
      if (versao.current === atual) {
        bloqueado.current = false;
        setSalvando(false);
      }
    }
  }

  const indisponivel = carregando || salvando || !pronto;

  return (
    <AppLayout
      user={usuarioEstoque}
      title="Bar"
      subtitle="Estoque de bebidas"
    >
      <div className={styles.page} aria-busy={carregando || salvando}>
        <div className={styles.heading}>
          <div>
            {tela !== "inicio" && (
              <Button
                type="button"
                variant="ghost"
                className={styles.back}
                disabled={salvando}
                onClick={() =>
                  navegar(
                    tela === "conferir"
                      ? "quantidade"
                      : tela === "quantidade"
                        ? "selecionar"
                        : "inicio",
                  )
                }
              >
                <ArrowLeft aria-hidden="true" size={20} />
                Voltar
              </Button>
            )}

            <h2 tabIndex={-1} ref={tituloRef}>
              {titulo}
            </h2>

            {(tela === "quantidade" ||
              tela === "conferir" ||
              tela === "selecionar") && (
              <p>
                {operacao === "entrada"
                  ? "Receber bebidas"
                  : "Registrar saída"}
                {" · "}Etapa{" "}
                {tela === "selecionar"
                  ? 1
                  : tela === "quantidade"
                    ? 2
                    : 3}{" "}
                de 3
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            aria-expanded={ajuda}
            aria-controls="ajuda-bar"
            onClick={() => setAjuda(!ajuda)}
          >
            <HelpCircle size={20} aria-hidden="true" />
            Ajuda
          </Button>
        </div>

        {ajuda && (
          <div id="ajuda-bar" className={styles.help}>
            Use <strong>Receber</strong> quando chegarem bebidas e{" "}
            <strong>Registrar saída</strong> quando forem retiradas.
            Um fardo reúne várias unidades: confira a quantidade na
            embalagem. Você poderá corrigir os números antes de confirmar.
          </div>
        )}

        <div role="status" aria-live="polite">
          {carregando && <p>Carregando estoque do bar...</p>}

          {mensagem && (
            <p className={styles.success}>
              <CheckCircle2 aria-hidden="true" size={24} />
              {mensagem}
            </p>
          )}
        </div>

        {erro && (
          <p role="alert" id="erro-bar" className={styles.error}>
            {erro}
          </p>
        )}

        {tela === "inicio" && (
          <div className={styles.actions}>
            <Button
              type="button"
              fullWidth
              disabled={indisponivel}
              onClick={() => iniciar("entrada")}
            >
              <span className={styles.actionContent}>
                <ArrowDownToLine aria-hidden="true" />
                <strong>Receber bebidas</strong>
                <span>Adicionar unidades ou fardos</span>
              </span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={indisponivel}
              onClick={() => iniciar("saida")}
            >
              <span className={styles.actionContent}>
                <ArrowUpFromLine aria-hidden="true" />
                <strong>Registrar saída</strong>
                <span>Retirar bebidas do estoque</span>
              </span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={indisponivel}
              onClick={() => {
                setBusca("");
                buscaRef.current?.focus();
              }}
            >
              <span className={styles.actionContent}>
                <Search aria-hidden="true" />
                <strong>Consultar estoque</strong>
                <span>Encontrar uma bebida e seu saldo</span>
              </span>
            </Button>
          </div>
        )}

        {(tela === "inicio" || tela === "selecionar") && (
          <section
            className={styles.stock}
            aria-label="Bebidas disponíveis"
          >
            <div className={styles.sectionHeading}>
              <h3>
                {tela === "inicio"
                  ? "Suas bebidas"
                  : "Selecione a bebida"}
              </h3>
              <span>{bebidas.length} bebidas cadastradas</span>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={carregando || salvando}
              onClick={() => void atualizar()}
            >
              Atualizar estoque
            </Button>

            <form
              onSubmit={(event) => {
                event.preventDefault();

                if (
                  !indisponivel &&
                  tela === "selecionar" &&
                  filtradas.length === 1
                ) {
                  const bebida = filtradas[0];

                  if (operacao === "entrada" || bebida.saldo > 0) {
                    selecionar(bebida);
                  }
                }
              }}
            >
              <Input
                label="Buscar pelo nome ou código de barras"
                ref={buscaRef}
                id="busca-bar"
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Ex.: água mineral"
                leftIcon={<Barcode size={20} />}
                hint="Digite o código ou use um leitor USB neste campo."
              />
            </form>

            {!carregando && pronto && (
              <p className={styles.hint} role="status">
                {filtradas.length} bebidas encontradas
              </p>
            )}

            <div className={styles.cards}>
              {filtradas.map((bebida) => (
                <article key={bebida.id} className={styles.card}>
                  <div className={styles.productIcon}>
                    <Wine aria-hidden="true" size={32} />
                  </div>

                  <div>
                    <h4>{bebida.nome}</h4>
                    <p>{bebida.volume}</p>
                  </div>

                  <span
                    className={
                      bebida.saldo <= bebida.minimo
                        ? styles.low
                        : styles.normal
                    }
                  >
                    {bebida.saldo === 0
                      ? "Sem estoque"
                      : bebida.saldo <= bebida.minimo
                        ? "Estoque baixo"
                        : "Em estoque"}
                  </span>

                  <p className={styles.balance}>
                    <strong>{bebida.saldo}</strong> unidades
                  </p>

                  {tela === "selecionar" ? (
                    <Button
                      type="button"
                      variant="primary"
                      disabled={
                        indisponivel ||
                        (operacao === "saida" && bebida.saldo === 0)
                      }
                      onClick={() => selecionar(bebida)}
                      aria-label={`Selecionar bebida ${bebida.nome}, ${bebida.volume}`}
                    >
                      Selecionar bebida
                    </Button>
                  ) : (
                    <div className={styles.cardButtons}>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={indisponivel}
                        onClick={() => selecionar(bebida, "entrada")}
                        aria-label={`Receber ${bebida.nome}, ${bebida.volume}`}
                      >
                        Receber
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={indisponivel || bebida.saldo === 0}
                        onClick={() => selecionar(bebida, "saida")}
                        aria-label={`Retirar ${bebida.nome}, ${bebida.volume}`}
                      >
                        Retirar
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {!carregando && pronto && filtradas.length === 0 && (
              <p className={styles.empty}>
                {bebidas.length === 0
                  ? "Nenhuma bebida cadastrada. Cadastre a primeira bebida para começar."
                  : "Nenhuma bebida encontrada. Confira o nome ou cadastre uma nova bebida."}
              </p>
            )}

            <Button
              type="button"
              variant="secondary"
              disabled={indisponivel}
              onClick={() => {
                setMensagem("");
                navegar("cadastro");
              }}
            >
              <Plus size={20} aria-hidden="true" />
              Cadastrar bebida
            </Button>
          </section>
        )}

        {tela === "quantidade" && produto && (
          <form
            className={styles.panel}
            onSubmit={conferir}
            aria-describedby={erro ? "erro-bar" : undefined}
          >
            <div className={styles.productSummary}>
              <Wine aria-hidden="true" size={32} />
              <div>
                <h3>{produto.nome}</h3>
                <p>
                  {produto.volume} · Disponível:{" "}
                  <strong>{produto.saldo} unidades</strong>
                </p>
              </div>
            </div>

            <fieldset className={styles.options}>
              <legend>Como você vai contar?</legend>

              {["unidade", "fardo"].map((valor) => (
                <label key={valor}>
                  <input
                    type="radio"
                    name="embalagem"
                    value={valor}
                    checked={embalagem === valor}
                    onChange={() => setEmbalagem(valor)}
                  />
                  {valor === "unidade"
                    ? "Unidades"
                    : "Fardos / caixas"}
                </label>
              ))}
            </fieldset>

            <div className={styles.fields}>
              <Input
                label={
                  embalagem === "fardo"
                    ? "Quantidade de fardos / caixas"
                    : "Quantidade de unidades"
                }
                id="quantidade"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                required
                value={quantidade}
                onChange={(event) => setQuantidade(event.target.value)}
              />

              {embalagem === "fardo" && (
                <>
                  <Input
                    label="Unidades em cada fardo / caixa"
                    id="por-fardo"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    required
                    value={porFardo}
                    onChange={(event) => setPorFardo(event.target.value)}
                  />

                  <Input
                    label="Unidades avulsas adicionais"
                    id="avulsas"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    required
                    value={avulsas}
                    onChange={(event) => setAvulsas(event.target.value)}
                  />
                </>
              )}
            </div>

            <p className={styles.total} aria-live="polite">
              Total:{" "}
              <strong>
                {inteiro(total, 0) ? total : "—"} unidades
              </strong>
            </p>

            <div className={styles.footer}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => navegar("inicio")}
              >
                Cancelar
              </Button>

              <Button type="submit" variant="primary">
                Conferir {operacao === "entrada" ? "entrada" : "saída"}
              </Button>
            </div>
          </form>
        )}

        {tela === "conferir" && produto && (
          <section
            className={styles.panel}
            aria-label="Resumo da movimentação"
          >
            <h3>{produto.nome}</h3>
            <p>{produto.volume}</p>

            {embalagem === "fardo" && (
              <p>
                {quantidade} fardos × {porFardo} unidades + {avulsas}{" "}
                unidades avulsas
              </p>
            )}

            <dl className={styles.summary}>
              <div>
                <dt>
                  {operacao === "entrada"
                    ? "Quantidade recebida"
                    : "Quantidade retirada"}
                </dt>
                <dd>{total} unidades</dd>
              </div>

              <div>
                <dt>Saldo atual</dt>
                <dd>{produto.saldo} unidades</dd>
              </div>

              <div>
                <dt>Saldo após confirmar</dt>
                <dd>{saldoDepois} unidades</dd>
              </div>
            </dl>

            <div className={styles.footer}>
              <Button
                type="button"
                variant="secondary"
                disabled={salvando}
                onClick={() => navegar("quantidade")}
              >
                Corrigir quantidade
              </Button>

              <Button
                type="button"
                variant="success"
                disabled={salvando}
                onClick={() => void confirmar()}
              >
                <CheckCircle2 size={22} aria-hidden="true" />
                {salvando
                  ? "Salvando..."
                  : `Confirmar ${operacao === "entrada" ? "entrada" : "saída"}`}
              </Button>
            </div>
          </section>
        )}

        {tela === "cadastro" && (
          <form className={styles.panel} onSubmit={cadastrar}>
            <p>
              Cadastre a bebida com saldo zero. Depois, registre a
              quantidade recebida.
            </p>

            <fieldset disabled={salvando} className={styles.options}>
              <legend>Dados da bebida</legend>

              <div className={styles.fields}>
                <Input
                  label="Nome da bebida"
                  id="nome"
                  name="nome"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex.: Suco de uva"
                />

                <Input
                  label="Embalagem e volume"
                  id="volume"
                  name="volume"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="Ex.: Caixa · 200 ml"
                />

                <Input
                  label="Código de barras (opcional)"
                  id="codigo"
                  name="codigo"
                  inputMode="numeric"
                  maxLength={14}
                  aria-describedby="codigo-ajuda"
                />

                <Input
                  label="Unidades por fardo / caixa"
                  id="fardo"
                  name="fardo"
                  type="number"
                  inputMode="numeric"
                  required
                  min="1"
                  max="10000"
                  step="1"
                  defaultValue="12"
                />

                <Input
                  label="Estoque mínimo em unidades"
                  id="minimo"
                  name="minimo"
                  type="number"
                  inputMode="numeric"
                  required
                  min="0"
                  max="1000000"
                  step="1"
                  defaultValue="6"
                />
              </div>
            </fieldset>

            <p id="codigo-ajuda" className={styles.hint}>
              Use o código impresso na unidade. O código não preenche
              automaticamente o nome.
            </p>

            <div className={styles.footer}>
              <Button
                type="button"
                variant="secondary"
                disabled={salvando}
                onClick={() => navegar("inicio")}
              >
                Cancelar
              </Button>

              <Button
                variant="primary"
                type="submit"
                disabled={salvando}
              >
                {salvando ? "Salvando..." : "Cadastrar bebida"}
              </Button>
            </div>
          </form>
        )}

        {tela === "inicio" && historico.length > 0 && (
          <section className={styles.stock}>
            <h3>Últimas movimentações</h3>

            <ul className={styles.history}>
              {historico.map((movimento) => (
                <li key={movimento.id}>
                  {textoMovimentacao(movimento)}
                  {movimento.registradoPor && (
                    <> Responsável: {movimento.registradoPor}.</>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppLayout>
  );
}