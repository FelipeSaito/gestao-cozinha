





export interface ProdutoNfeXml {
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

function lerNumero(
  valor: string,
): number {
  return Number(
    valor.replace(",", "."),
  );
}

export function normalizarUnidadeNfe(
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

export function lerProdutosNfeXml(
  conteudo: string,
): ProdutoNfeXml[] {
  if (
    /<!DOCTYPE|<!ENTITY/i.test(
      conteudo,
    )
  ) {
    throw new Error(
      "O XML contém uma declaração não permitida.",
    );
  }

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

  if (detalhes.length > 500) {
    throw new Error(
      "A NF-e possui produtos demais para uma única importação.",
    );
  }

  return detalhes.map(
    (
      detalhe,
      indice,
    ): ProdutoNfeXml => {
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

      const quantidade =
        lerNumero(
          textoXml(
            produto,
            "qCom",
          ),
        );

      const custoUnitario =
        lerNumero(
          textoXml(
            produto,
            "vUnCom",
          ),
        );

      if (
        !nome ||
        !Number.isFinite(
          quantidade,
        ) ||
        quantidade <= 0 ||
        !Number.isFinite(
          custoUnitario,
        ) ||
        custoUnitario < 0
      ) {
        throw new Error(
          `O produto ${indice + 1} não possui nome, quantidade ou custo válidos.`,
        );
      }

      const validade = rastro
        ? textoXml(
            rastro,
            "dVal",
          )
        : "";

      if (
        validade &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          validade,
        )
      ) {
        throw new Error(
          `A validade do produto ${indice + 1} está inválida.`,
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
        validade,
        quantidade:
          String(quantidade),
        unidade:
          normalizarUnidadeNfe(
            textoXml(
              produto,
              "uCom",
            ),
          ),
        custoUnitario:
          String(custoUnitario),
      };
    },
  );
}

export async function gerarOperacaoIdNfe(
  nfeChave: string,
  itemChave: string,
): Promise<string> {
  if (
    !/^\d{44}$/.test(
      nfeChave,
    ) ||
    !itemChave.trim()
  ) {
    throw new Error(
      "Não foi possível identificar o item da NF-e.",
    );
  }

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