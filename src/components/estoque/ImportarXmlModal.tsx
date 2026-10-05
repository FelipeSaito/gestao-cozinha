"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useId,
  useRef,
  useState,
} from "react";

import {
  FileUp,
  Trash2,
} from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

import {
  registrarEntrada,
  type NovaEntrada,
} from "@/services/entradasFirestore";

import styles from "./ImportarXmlModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (
    importados: number,
    repetidos: number,
  ) => Promise<void>;
}

interface ProdutoXml {
  chave: string;
  nfeChave: string;
  codigo: string;
  nome: string;
  categoria: string;
  lote: string;
  validade: string;
  quantidade: string;
  unidade: string;
  custoUnitario: string;
}

function textoXml(
  elemento: Element,
  tag: string,
): string {
  return (
    elemento
      .getElementsByTagName(tag)
      .item(0)
      ?.textContent?.trim() ?? ""
  );
}

function numeroXml(
  valor: string,
): string {
  const numero = Number(
    valor.replace(",", "."),
  );

  if (!Number.isFinite(numero)) {
    return "";
  }

  return String(numero);
}

function normalizarUnidade(
  unidade: string,
): string {
  const valor = unidade
    .trim()
    .toUpperCase();

  if (
    valor === "KG" ||
    valor === "KILO" ||
    valor === "QUILOGRAMA"
  ) {
    return "kg";
  }

  if (
    valor === "L" ||
    valor === "LT" ||
    valor === "LITRO" ||
    valor === "LITROS"
  ) {
    return "litros";
  }

  return "unidades";
}

function lerProdutosXml(
  conteudo: string,
): ProdutoXml[] {
  const documento =
    new DOMParser().parseFromString(
      conteudo,
      "application/xml",
    );

  if (
    documento.getElementsByTagName(
      "parsererror",
    ).length > 0
  ) {
    throw new Error(
      "O arquivo selecionado não contém um XML válido.",
    );
  }

  const infNFe =
    documento
      .getElementsByTagName("infNFe")
      .item(0);

  if (!infNFe) {
    throw new Error(
      "O arquivo não parece ser uma NF-e válida.",
    );
  }

  const identificadorNfe =
    infNFe.getAttribute("Id") ?? "";

  const nfeChave =
    identificadorNfe.replace(
      /^NFe/i,
      "",
    );

  if (!/^\d{44}$/.test(nfeChave)) {
    throw new Error(
      "A NF-e não possui uma chave de acesso válida.",
    );
  }

  const detalhes = Array.from(
    documento.getElementsByTagName(
      "det",
    ),
  );

  if (detalhes.length === 0) {
    throw new Error(
      "Nenhum produto foi encontrado nesta NF-e.",
    );
  }

  return detalhes.map(
    (
      detalhe,
      indice,
    ): ProdutoXml => {
      const produto =
        detalhe
          .getElementsByTagName(
            "prod",
          )
          .item(0);

      if (!produto) {
        throw new Error(
          `O produto ${indice + 1} da NF-e está inválido.`,
        );
      }

      const rastro =
        produto
          .getElementsByTagName(
            "rastro",
          )
          .item(0);

      const codigo =
        textoXml(
          produto,
          "cProd",
        ) || String(indice + 1);

      const nome = textoXml(
        produto,
        "xProd",
      );

      const quantidade = numeroXml(
        textoXml(
          produto,
          "qCom",
        ),
      );

      const custoUnitario =
        numeroXml(
          textoXml(
            produto,
            "vUnCom",
          ),
        );

      if (
        !nome ||
        !quantidade ||
        !custoUnitario
      ) {
        throw new Error(
          `O produto ${indice + 1} não possui nome, quantidade ou custo válidos.`,
        );
      }

      return {
        chave: `${codigo}-${indice}`,
        nfeChave,
        codigo,
        nome,
        categoria: "",
        lote: rastro
          ? textoXml(
              rastro,
              "nLote",
            )
          : "",
        validade: rastro
          ? textoXml(
              rastro,
              "dVal",
            )
          : "",
        quantidade,
        unidade:
          normalizarUnidade(
            textoXml(
              produto,
              "uCom",
            ),
          ),
        custoUnitario,
      };
    },
  );
}

async function gerarOperacaoIdNfe(
  nfeChave: string,
  itemChave: string,
): Promise<string> {
  const conteudo =
    new TextEncoder().encode(
      `${nfeChave}|${itemChave}`,
    );

  const hash =
    await crypto.subtle.digest(
      "SHA-256",
      conteudo,
    );

  const bytes =
    new Uint8Array(
      hash,
    ).slice(0, 16);

  bytes[6] =
    (bytes[6] & 0x0f) | 0x50;

  bytes[8] =
    (bytes[8] & 0x3f) | 0x80;

  const hexadecimal =
    Array.from(
      bytes,
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0"),
    ).join("");

  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20, 32),
  ].join("-");
}

export function ImportarXmlModal({
  open,
  onClose,
  onSaved,
}: Props) {
  const formId = useId();

  const [
    arquivoNome,
    setArquivoNome,
  ] = useState("");

  const [
    produtos,
    setProdutos,
  ] = useState<ProdutoXml[]>([]);

  const [
    erro,
    setErro,
  ] = useState<string | null>(
    null,
  );

  const [
    salvando,
    setSalvando,
  ] = useState(false);

  const operacoes = useRef<
    Record<string, string>
  >({});

  const trava = useRef(false);

  function limpar() {
    setArquivoNome("");
    setProdutos([]);
    setErro(null);
    operacoes.current = {};
  }

  function fechar() {
    if (trava.current) {
      return;
    }

    limpar();
    onClose();
  }

  async function selecionarArquivo(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const arquivo =
      event.target.files?.[0];

    event.target.value = "";

    if (!arquivo) {
      return;
    }

    setErro(null);

    if (
      !arquivo.name
        .toLowerCase()
        .endsWith(".xml")
    ) {
      setProdutos([]);
      setArquivoNome("");

      setErro(
        "Selecione o arquivo XML da NF-e.",
      );

      return;
    }

    if (arquivo.size > 5_000_000) {
      setProdutos([]);
      setArquivoNome("");

      setErro(
        "O arquivo XML deve possuir no máximo 5 MB.",
      );

      return;
    }

    try {
      const conteudo =
        await arquivo.text();

      const encontrados =
        lerProdutosXml(
          conteudo,
        );

      setArquivoNome(
        arquivo.name,
      );

      setProdutos(
        encontrados,
      );

      operacoes.current = {};
    } catch (falha) {
      setProdutos([]);
      setArquivoNome("");

      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível ler a NF-e.",
      );
    }
  }

  function alterarProduto(
    chave: string,
    campo: keyof Omit<
      ProdutoXml,
      | "chave"
      | "codigo"
      | "nfeChave"
    >,
    valor: string,
  ) {
    if (trava.current) {
      return;
    }

    setProdutos((atuais) =>
      atuais.map(
        (produto) =>
          produto.chave ===
          chave
            ? {
                ...produto,
                [campo]: valor,
              }
            : produto,
      ),
    );

    setErro(null);
  }

  function removerProduto(
    chave: string,
  ) {
    if (trava.current) {
      return;
    }

    setProdutos((atuais) =>
      atuais.filter(
        (produto) =>
          produto.chave !==
          chave,
      ),
    );

    delete operacoes.current[
      chave
    ];

    setErro(null);
  }

  function validarProduto(
    produto: ProdutoXml,
  ): NovaEntrada | null {
    const quantidade = Number(
      produto.quantidade.replace(
        ",",
        ".",
      ),
    );

    const custoUnitario =
      Number(
        produto.custoUnitario.replace(
          ",",
          ".",
        ),
      );

    if (
      !produto.nome.trim() ||
      !produto.categoria.trim() ||
      !produto.lote.trim() ||
      !produto.validade ||
      !produto.unidade.trim() ||
      !Number.isFinite(
        quantidade,
      ) ||
      quantidade <= 0 ||
      !Number.isFinite(
        custoUnitario,
      ) ||
      custoUnitario < 0
    ) {
      return null;
    }

    return {
      nome: produto.nome.trim(),
      categoria:
        produto.categoria.trim(),
      lote: produto.lote.trim(),
      validade:
        produto.validade,
      quantidade,
      unidade:
        produto.unidade,
      custoUnitario,
    };
  }

  async function importar(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      trava.current ||
      produtos.length === 0
    ) {
      return;
    }

    const entradas =
      produtos.map(
        validarProduto,
      );

    if (
      entradas.some(
        (entrada) =>
          entrada === null,
      )
    ) {
      setErro(
        "Preencha categoria, lote, validade, quantidade, unidade e custo de todos os produtos.",
      );

      return;
    }

    trava.current = true;
    setSalvando(true);
    setErro(null);

    let importados = 0;
    let repetidos = 0;

    try {
      for (
        let indice = 0;
        indice <
        produtos.length;
        indice += 1
      ) {
        const produto =
          produtos[indice];

        const entrada =
          entradas[
            indice
          ] as NovaEntrada;

        operacoes.current[
          produto.chave
        ] ??=
          await gerarOperacaoIdNfe(
            produto.nfeChave,
            produto.chave,
          );

        const resultado =
          await registrarEntrada(
            entrada,
            operacoes.current[
              produto.chave
            ],
          );

        if (
          resultado.repetida
        ) {
          repetidos += 1;
        } else {
          importados += 1;
        }
      }

      try {
        await onSaved(
          importados,
          repetidos,
        );
      } catch {
        /*
         * As entradas já foram
         * confirmadas no servidor.
         */
      }

      limpar();
      onClose();
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível importar os produtos da NF-e.",
      );
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Importar produtos da NF-e"
      size="large"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={fechar}
            disabled={salvando}
          >
            Cancelar
          </Button>

          <Button
            variant="primary"
            type="submit"
            form={formId}
            disabled={
              salvando ||
              produtos.length ===
                0
            }
          >
            {salvando
              ? "Importando..."
              : `Importar ${
                  produtos.length ||
                  ""
                } ${
                  produtos.length ===
                  1
                    ? "produto"
                    : "produtos"
                }`}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={importar}
        className={
          styles.formulario
        }
      >
        <p
          className={
            styles.instrucao
          }
        >
          Selecione o XML da
          NF-e, confira os
          produtos e preencha as
          informações que não
          vieram na nota.
        </p>

        <label
          className={
            styles.upload
          }
        >
          <FileUp
            size={22}
            aria-hidden="true"
          />

          <span>
            {arquivoNome ||
              "Selecionar XML da NF-e"}
          </span>

          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            disabled={salvando}
            onChange={
              selecionarArquivo
            }
          />
        </label>

        {produtos.length >
          0 && (
          <div
            className={
              styles.lista
            }
          >
            {produtos.map(
              (
                produto,
                indice,
              ) => (
                <section
                  key={
                    produto.chave
                  }
                  className={
                    styles.produto
                  }
                  aria-labelledby={`produto-${produto.chave}`}
                >
                  <div
                    className={
                      styles.produtoCabecalho
                    }
                  >
                    <div>
                      <span
                        className={
                          styles.numero
                        }
                      >
                        Produto{" "}
                        {indice +
                          1}
                      </span>

                      <h3
                        id={`produto-${produto.chave}`}
                      >
                        {
                          produto.nome
                        }
                      </h3>

                      <small>
                        Código na
                        nota:{" "}
                        {
                          produto.codigo
                        }
                      </small>
                    </div>

                    <button
                      type="button"
                      className={
                        styles.remover
                      }
                      onClick={() =>
                        removerProduto(
                          produto.chave,
                        )
                      }
                      disabled={
                        salvando
                      }
                      aria-label={`Remover ${produto.nome}`}
                    >
                      <Trash2
                        size={18}
                        aria-hidden="true"
                      />
                      Remover
                    </button>
                  </div>

                  <div
                    className={
                      styles.grade
                    }
                  >
                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Ingrediente
                      </span>

                      <input
                        required
                        maxLength={
                          120
                        }
                        value={
                          produto.nome
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "nome",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Categoria
                      </span>

                      <input
                        required
                        maxLength={
                          80
                        }
                        placeholder="Ex.: Farinhas"
                        value={
                          produto.categoria
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "categoria",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Lote
                      </span>

                      <input
                        required
                        maxLength={
                          80
                        }
                        placeholder="Código da embalagem"
                        value={
                          produto.lote
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "lote",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Validade
                      </span>

                      <input
                        required
                        type="date"
                        value={
                          produto.validade
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "validade",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Quantidade
                      </span>

                      <input
                        required
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={
                          produto.quantidade
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "quantidade",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Unidade
                      </span>

                      <select
                        required
                        value={
                          produto.unidade
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "unidade",
                            event
                              .target
                              .value,
                          )
                        }
                      >
                        <option value="kg">
                          kg
                        </option>

                        <option value="litros">
                          litros
                        </option>

                        <option value="unidades">
                          unidades
                        </option>
                      </select>
                    </label>

                    <label
                      className={
                        styles.campo
                      }
                    >
                      <span>
                        Custo por
                        unidade (R$)
                      </span>

                      <input
                        required
                        type="number"
                        min="0"
                        step="0.0001"
                        value={
                          produto.custoUnitario
                        }
                        disabled={
                          salvando
                        }
                        onChange={(
                          event,
                        ) =>
                          alterarProduto(
                            produto.chave,
                            "custoUnitario",
                            event
                              .target
                              .value,
                          )
                        }
                      />
                    </label>
                  </div>
                </section>
              ),
            )}
          </div>
        )}

        {erro && (
          <Alert variant="danger">
            {erro}
          </Alert>
        )}
      </form>
    </Modal>
  );
}