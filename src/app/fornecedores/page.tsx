"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Truck,
  UserRound,
} from "lucide-react";

import { AppLayout } from "@/components/layout/AppLayout";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/contexts/AuthContext";
import {
  cadastrarFornecedor,
  editarFornecedor,
  listarFornecedores,
  type DadosFornecedor,
  type Fornecedor,
} from "@/services/fornecedores";

import styles from "./page.module.css";

type Filtro = "todos" | "ativos" | "inativos";

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function documentoChave(valor: string) {
  return valor.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function ordenar(lista: Fornecedor[]) {
  return [...lista].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error
    ? erro.message
    : "Não foi possível concluir a operação.";
}

export default function FornecedoresPage() {
  const { usuario } = useAuth();
  const usuarioId = usuario?.id;

  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [edicao, setEdicao] =
    useState<Fornecedor | "novo" | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [alterandoId, setAlterandoId] = useState<string | null>(null);

  const cabecalhoRef = useRef<HTMLHeadingElement>(null);
  const voltarFoco = useRef(false);
  const versao = useRef(0);
  const consulta = useRef(0);
  const ocupado = useRef(false);

  const carregar = useCallback(async () => {
    if (!usuarioId || ocupado.current) return;

    const sessao = versao.current;
    const numero = ++consulta.current;

    setCarregando(true);
    setErro("");

    try {
      const fornecedores = await listarFornecedores();

      if (
        versao.current !== sessao ||
        consulta.current !== numero
      ) {
        return;
      }

      setLista(ordenar(fornecedores));
    } catch (falha) {
      if (
        versao.current === sessao &&
        consulta.current === numero
      ) {
        setErro(mensagemErro(falha));
      }
    } finally {
      if (
        versao.current === sessao &&
        consulta.current === numero
      ) {
        setCarregando(false);
      }
    }
  }, [usuarioId]);

  useEffect(() => {
    versao.current += 1;
    consulta.current += 1;
    ocupado.current = false;

    const temporizador = window.setTimeout(() => {
      setLista([]);
      setEdicao(null);
      setAlterandoId(null);
      setMensagem("");
      setErro("");
      setCarregando(Boolean(usuarioId));

      if (usuarioId) {
        void carregar();
      }
    }, 0);

    return () => {
      window.clearTimeout(temporizador);
      versao.current += 1;
      consulta.current += 1;
    };
  }, [usuarioId, carregar]);

  useEffect(() => {
    if (!edicao && voltarFoco.current) {
      cabecalhoRef.current?.focus();
      voltarFoco.current = false;
    }
  }, [edicao]);

  const termo = normalizar(busca);
  const documentoBuscado = documentoChave(busca);

  const visiveis = lista.filter((fornecedor) => {
    const texto = normalizar(
      [
        fornecedor.nome,
        fornecedor.contato,
        fornecedor.produtos,
        fornecedor.documento,
      ].join(" "),
    );

    const correspondeBusca =
      texto.includes(termo) ||
      (documentoBuscado.length > 0 &&
        documentoChave(fornecedor.documento).includes(
          documentoBuscado,
        ));

    const correspondeFiltro =
      filtro === "todos" ||
      (filtro === "ativos"
        ? fornecedor.ativo
        : !fornecedor.ativo);

    return correspondeBusca && correspondeFiltro;
  });

  function abrir(fornecedor: Fornecedor | "novo") {
    if (!usuarioId || ocupado.current || carregando) return;

    setEdicao(fornecedor);
    setMensagem("");
    setErro("");
  }

  function fechar() {
    if (ocupado.current) return;

    voltarFoco.current = true;
    setEdicao(null);
  }

  async function salvar(
    dados: DadosFornecedor,
    operacaoId: string,
  ) {
    if (!usuarioId || !edicao) {
      throw new Error("Entre novamente para salvar o fornecedor.");
    }

    if (ocupado.current) {
      throw new Error("Aguarde a operação em andamento.");
    }

    const cadastro = edicao;
    const sessao = versao.current;
    ocupado.current = true;

    try {
      if (cadastro === "novo") {
        const resultado = await cadastrarFornecedor(
          operacaoId,
          dados,
        );

        if (versao.current !== sessao) {
          throw new Error("Sua sessão mudou. Atualize a página.");
        }

        const novo: Fornecedor = {
          ...dados,
          id: resultado.id,
          versao: resultado.versao,
        };

        setLista((atual) =>
          ordenar([
            novo,
            ...atual.filter((item) => item.id !== novo.id),
          ]),
        );

        setMensagem(
          `${dados.nome}: fornecedor cadastrado com sucesso.`,
        );
      } else {
        const resultado = await editarFornecedor(
          cadastro.id,
          cadastro.versao,
          dados,
        );

        if (versao.current !== sessao) {
          throw new Error("Sua sessão mudou. Atualize a página.");
        }

        setLista((atual) =>
          ordenar(
            atual.map((item) =>
              item.id === cadastro.id
                ? {
                    ...item,
                    ...dados,
                    versao: resultado.versao,
                  }
                : item,
            ),
          ),
        );

        setMensagem(
          `${dados.nome}: cadastro atualizado com sucesso.`,
        );
      }
    } finally {
      if (versao.current === sessao) {
        ocupado.current = false;
      }
    }
  }

  async function alternar(fornecedor: Fornecedor) {
    if (!usuarioId || ocupado.current || carregando) return;

    const sessao = versao.current;
    const ativo = !fornecedor.ativo;

    ocupado.current = true;
    setAlterandoId(fornecedor.id);
    setMensagem("");
    setErro("");

    try {
      const resultado = await editarFornecedor(
        fornecedor.id,
        fornecedor.versao,
        {
          nome: fornecedor.nome,
          documento: fornecedor.documento,
          contato: fornecedor.contato,
          telefone: fornecedor.telefone,
          produtos: fornecedor.produtos,
          ativo,
        },
      );

      if (versao.current !== sessao) return;

      setLista((atual) =>
        atual.map((item) =>
          item.id === fornecedor.id
            ? { ...item, ativo, versao: resultado.versao }
            : item,
        ),
      );

      setMensagem(
        ativo
          ? `${fornecedor.nome} reativado com sucesso.`
          : `${fornecedor.nome} marcado como inativo.`,
      );
    } catch (falha) {
      if (versao.current === sessao) {
        setErro(mensagemErro(falha));
      }
    } finally {
      if (versao.current === sessao) {
        ocupado.current = false;
        setAlterandoId(null);
      }
    }
  }

  const filtros: { id: Filtro; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "ativos", label: "Ativos" },
    { id: "inativos", label: "Inativos" },
  ];

  return (
    <AppLayout
      title="Fornecedores"
      subtitle="Encontre quem fornece os ingredientes e bebidas."
      headerActions={
        !edicao ? (
          <Button
            type="button"
            leftIcon={<Plus size={20} />}
            disabled={carregando || !!alterandoId || !usuarioId}
            onClick={() => abrir("novo")}
          >
            Novo fornecedor
          </Button>
        ) : undefined
      }
    >
      <div className={styles.page}>
        <div role="status" aria-live="polite" aria-atomic="true">
          {mensagem && (
            <p className={styles.success}>
              <CheckCircle2 size={22} aria-hidden="true" />
              {mensagem}
            </p>
          )}
        </div>

        {erro && <Alert variant="danger">{erro}</Alert>}

        {!usuarioId ? (
          <p>Entre com sua conta para acessar os fornecedores.</p>
        ) : edicao ? (
          <FornecedorForm
            key={
              edicao === "novo"
                ? `${usuarioId}-novo`
                : `${usuarioId}-${edicao.id}-${edicao.versao}`
            }
            inicial={edicao === "novo" ? undefined : edicao}
            lista={lista}
            onSave={salvar}
            onSuccess={fechar}
            onCancel={fechar}
          />
        ) : carregando ? (
          <section
            className={styles.panel}
            aria-live="polite"
            aria-busy="true"
          >
            <p>Carregando fornecedores...</p>
          </section>
        ) : (
          <>
            <section
              className={styles.metrics}
              aria-label="Resumo de fornecedores"
            >
              <div className={styles.metric}>
                <Truck aria-hidden="true" />
                <span>Cadastrados</span>
                <strong>{lista.length}</strong>
              </div>

              <div className={styles.metric}>
                <CheckCircle2 aria-hidden="true" />
                <span>Ativos</span>
                <strong>
                  {lista.filter((item) => item.ativo).length}
                </strong>
              </div>

              <div className={styles.metric}>
                <Package aria-hidden="true" />
                <span>Inativos</span>
                <strong>
                  {lista.filter((item) => !item.ativo).length}
                </strong>
              </div>
            </section>

            <section
              className={styles.panel}
              aria-labelledby="lista-fornecedores"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <h2
                    id="lista-fornecedores"
                    ref={cabecalhoRef}
                    tabIndex={-1}
                  >
                    Seus fornecedores
                  </h2>
                  <p>
                    Consulte os contatos e mantenha os cadastros
                    organizados.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={!!alterandoId}
                  onClick={() => void carregar()}
                >
                  Atualizar lista
                </Button>
              </div>

              <div className={styles.toolbar}>
                <Input
                  label="Buscar fornecedor"
                  type="search"
                  value={busca}
                  leftIcon={<Search size={20} />}
                  placeholder="Nome, CNPJ ou produto fornecido"
                  onChange={(evento) => setBusca(evento.target.value)}
                />

                <Button
                  type="button"
                  variant="secondary"
                  disabled={!busca && filtro === "todos"}
                  onClick={() => {
                    setBusca("");
                    setFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>

              <div
                className={styles.filters}
                role="group"
                aria-label="Situação dos fornecedores"
              >
                {filtros.map((opcao) => (
                  <Button
                    type="button"
                    key={opcao.id}
                    variant={
                      filtro === opcao.id ? "primary" : "secondary"
                    }
                    aria-pressed={filtro === opcao.id}
                    onClick={() => setFiltro(opcao.id)}
                  >
                    {opcao.label}
                  </Button>
                ))}
              </div>

              <p className={styles.muted} role="status">
                {visiveis.length} de {lista.length} fornecedores
              </p>

              <div className={styles.cards}>
                {visiveis.map((fornecedor) => (
                  <article
                    className={styles.card}
                    key={fornecedor.id}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.iconBox}>
                        <Truck size={26} aria-hidden="true" />
                      </span>
                      <span
                        className={
                          fornecedor.ativo
                            ? styles.good
                            : styles.neutral
                        }
                      >
                        {fornecedor.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <h3>{fornecedor.nome}</h3>
                    <p className={styles.muted}>
                      CNPJ: {fornecedor.documento || "Não informado"}
                    </p>

                    <dl className={styles.details}>
                      <div>
                        <dt>
                          <UserRound size={18} aria-hidden="true" />
                          Contato
                        </dt>
                        <dd>
                          {fornecedor.contato || "Não informado"}
                        </dd>
                      </div>

                      <div>
                        <dt>
                          <Phone size={18} aria-hidden="true" />
                          Telefone
                        </dt>
                        <dd>
                          {fornecedor.telefone || "Não informado"}
                        </dd>
                      </div>

                      <div>
                        <dt>
                          <Package size={18} aria-hidden="true" />
                          Produtos fornecidos
                        </dt>
                        <dd>
                          {fornecedor.produtos || "Não informados"}
                        </dd>
                      </div>
                    </dl>

                    <div className={styles.cardFooter}>
                      <Button
                        type="button"
                        variant="secondary"
                        leftIcon={<Pencil size={18} />}
                        disabled={!!alterandoId}
                        onClick={() => abrir(fornecedor)}
                        aria-label={`Editar ${fornecedor.nome}`}
                      >
                        Editar
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!!alterandoId}
                        onClick={() => void alternar(fornecedor)}
                        aria-label={`${
                          fornecedor.ativo ? "Desativar" : "Reativar"
                        } ${fornecedor.nome}`}
                      >
                        {alterandoId === fornecedor.id
                          ? "Salvando..."
                          : fornecedor.ativo
                            ? "Desativar"
                            : "Reativar"}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              {visiveis.length === 0 && (
                <div className={styles.empty}>
                  <Truck size={36} aria-hidden="true" />
                  <h3>Nenhum fornecedor encontrado</h3>
                  <p>
                    {lista.length === 0
                      ? "Cadastre um fornecedor para começar."
                      : "Tente outro nome ou limpe os filtros."}
                  </p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

interface FornecedorFormProps {
  inicial?: Fornecedor;
  lista: Fornecedor[];
  onSave: (
    dados: DadosFornecedor,
    operacaoId: string,
  ) => Promise<void>;
  onSuccess: () => void;
  onCancel: () => void;
}

function FornecedorForm({
  inicial,
  lista,
  onSave,
  onSuccess,
  onCancel,
}: FornecedorFormProps) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [documento, setDocumento] = useState(
    inicial?.documento ?? "",
  );
  const [contato, setContato] = useState(inicial?.contato ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [produtos, setProdutos] = useState(inicial?.produtos ?? "");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);

  const [erros, setErros] = useState<{
    nome?: string;
    documento?: string;
  }>({});
  const [erroEnvio, setErroEnvio] = useState("");
  const [salvando, setSalvando] = useState(false);

  const tituloRef = useRef<HTMLHeadingElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const documentoRef = useRef<HTMLInputElement>(null);
  const operacaoId = useRef<string | null>(null);
  const enviando = useRef(false);

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando.current) return;

    const errosNovos: typeof erros = {};

    if (nome.trim().length < 2 || nome.trim().length > 100) {
      errosNovos.nome =
        "Informe o nome do fornecedor com 2 a 100 caracteres.";
    }

    if (
      documento.trim() &&
      !documentoChave(documento)
    ) {
      errosNovos.documento =
        "Confira o documento digitado ou deixe em branco.";
    }

    if (
      documentoChave(documento) &&
      lista.some(
        (fornecedor) =>
          fornecedor.id !== inicial?.id &&
          documentoChave(fornecedor.documento) ===
            documentoChave(documento),
      )
    ) {
      errosNovos.documento =
        "Este documento já foi informado em outro cadastro.";
    }

    setErros(errosNovos);
    setErroEnvio("");

    if (errosNovos.nome) {
      nomeRef.current?.focus();
      return;
    }

    if (errosNovos.documento) {
      documentoRef.current?.focus();
      return;
    }

    const dados: DadosFornecedor = {
      nome: nome.trim(),
      documento: documento.trim(),
      contato: contato.trim(),
      telefone: telefone.trim(),
      produtos: produtos.trim(),
      ativo,
    };

    operacaoId.current ??= crypto.randomUUID();
    enviando.current = true;
    setSalvando(true);

    try {
      await onSave(dados, operacaoId.current);
      operacaoId.current = null;
      onSuccess();
    } catch (falha) {
      setErroEnvio(mensagemErro(falha));
    } finally {
      enviando.current = false;
      setSalvando(false);
    }
  }

  return (
    <form
      className={styles.formPanel}
      onSubmit={enviar}
      noValidate
    >
      <Button
        type="button"
        variant="ghost"
        leftIcon={<ArrowLeft size={20} />}
        onClick={onCancel}
        disabled={salvando}
      >
        Voltar à lista
      </Button>

      <div className={styles.sectionHeading}>
        <div>
          <h2 ref={tituloRef} tabIndex={-1}>
            {inicial ? "Editar fornecedor" : "Novo fornecedor"}
          </h2>
          <p>
            O nome é obrigatório. Complete os demais dados quando
            tiver as informações.
          </p>
        </div>
      </div>

      <div className={styles.fields}>
        <Input
          ref={nomeRef}
          label="Nome do fornecedor"
          required
          maxLength={100}
          value={nome}
          error={erros.nome}
          disabled={salvando}
          onChange={(evento) => {
            setNome(evento.target.value);
            setErros((anteriores) => ({
              ...anteriores,
              nome: undefined,
            }));
          }}
          placeholder="Ex.: Distribuidora de bebidas"
        />

        <Input
          ref={documentoRef}
          label="CNPJ (opcional)"
          maxLength={30}
          value={documento}
          error={erros.documento}
          disabled={salvando}
          onChange={(evento) => {
            setDocumento(evento.target.value);
            setErros((anteriores) => ({
              ...anteriores,
              documento: undefined,
            }));
          }}
          hint="Registro manual. Não realiza consulta ou validação oficial do CNPJ."
        />

        <Input
          label="Pessoa de contato (opcional)"
          maxLength={80}
          value={contato}
          disabled={salvando}
          onChange={(evento) => setContato(evento.target.value)}
        />

        <Input
          label="Telefone (opcional)"
          type="tel"
          autoComplete="tel"
          maxLength={30}
          value={telefone}
          disabled={salvando}
          onChange={(evento) => setTelefone(evento.target.value)}
          placeholder="DDD e número"
        />
      </div>

      <Input
        label="Produtos fornecidos (opcional)"
        maxLength={200}
        value={produtos}
        disabled={salvando}
        onChange={(evento) => setProdutos(evento.target.value)}
        placeholder="Ex.: carne moída, frango e calabresa"
      />

      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={ativo}
          disabled={salvando}
          onChange={(evento) => setAtivo(evento.target.checked)}
        />
        Fornecedor ativo
      </label>

      {erroEnvio && (
        <Alert variant="danger">{erroEnvio}</Alert>
      )}

      <div className={styles.formFooter}>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={salvando}
        >
          Cancelar
        </Button>

        <Button
          type="submit"
          leftIcon={<CheckCircle2 size={20} />}
          disabled={salvando}
        >
          {salvando ? "Salvando..." : "Salvar fornecedor"}
        </Button>
      </div>
    </form>
  );
}