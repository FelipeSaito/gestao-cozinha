import {
  describe,
  expect,
  it,
} from "vitest";

import {
  gerarOperacaoIdNfe,
  lerProdutosNfeXml,
  normalizarUnidadeNfe,
} from "@/lib/nfe-xml";

const CHAVE_NFE =
  "1".repeat(44);

const XML_VALIDO = `
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${CHAVE_NFE}">
      <det nItem="1">
        <prod>
          <cProd>568</cProd>
          <xProd>Amido de milho 1 kg</xProd>
          <qCom>10.000</qCom>
          <uCom>KG</uCom>
          <vUnCom>6.88</vUnCom>
          <rastro>
            <nLote>LOTE-001</nLote>
            <qLote>10.000</qLote>
            <dFab>2026-09-01</dFab>
            <dVal>2027-09-01</dVal>
          </rastro>
        </prod>
      </det>

      <det nItem="2">
        <prod>
          <cProd>597</cProd>
          <xProd>Óleo vegetal</xProd>
          <qCom>5.000</qCom>
          <uCom>LT</uCom>
          <vUnCom>95.12</vUnCom>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>
`.trim();

describe(
  "normalizarUnidadeNfe",
  () => {
    it(
      "converte unidades conhecidas",
      () => {
        expect(
          normalizarUnidadeNfe(
            "KG",
          ),
        ).toBe("kg");

        expect(
          normalizarUnidadeNfe(
            "lt",
          ),
        ).toBe("litros");

        expect(
          normalizarUnidadeNfe(
            "UN",
          ),
        ).toBe(
          "unidades",
        );
      },
    );
  },
);

describe(
  "lerProdutosNfeXml",
  () => {
    it(
      "extrai os produtos da NF-e",
      () => {
        const produtos =
          lerProdutosNfeXml(
            XML_VALIDO,
          );

        expect(
          produtos,
        ).toHaveLength(2);

        expect(
          produtos[0],
        ).toMatchObject({
          chave: "568-0",
          nfeChave:
            CHAVE_NFE,
          codigo: "568",
          nome:
            "Amido de milho 1 kg",
          categoria: "",
          lote: "LOTE-001",
          validade:
            "2027-09-01",
          quantidade: "10",
          unidade: "kg",
          custoUnitario:
            "6.88",
        });

        expect(
          produtos[1],
        ).toMatchObject({
          chave: "597-1",
          nfeChave:
            CHAVE_NFE,
          codigo: "597",
          nome:
            "Óleo vegetal",
          lote: "",
          validade: "",
          quantidade: "5",
          unidade:
            "litros",
          custoUnitario:
            "95.12",
        });
      },
    );

    it(
      "rejeita XML malformado",
      () => {
        expect(() =>
          lerProdutosNfeXml(
            "<NFe><produto>",
          ),
        ).toThrow(
          "O arquivo selecionado não contém um XML válido.",
        );
      },
    );

    it(
      "rejeita arquivo que não é NF-e",
      () => {
        expect(() =>
          lerProdutosNfeXml(
            "<documento />",
          ),
        ).toThrow(
          "O arquivo não parece ser uma NF-e válida.",
        );
      },
    );

    it(
      "rejeita chave de acesso inválida",
      () => {
        const xml =
          XML_VALIDO.replace(
            `NFe${CHAVE_NFE}`,
            "NFe123",
          );

        expect(() =>
          lerProdutosNfeXml(
            xml,
          ),
        ).toThrow(
          "A NF-e não possui uma chave de acesso válida.",
        );
      },
    );

    it(
      "rejeita declarações potencialmente perigosas",
      () => {
        const xml = `
          <!DOCTYPE teste [
            <!ENTITY arquivo SYSTEM "file:///arquivo">
          ]>
          ${XML_VALIDO}
        `;

        expect(() =>
          lerProdutosNfeXml(
            xml,
          ),
        ).toThrow(
          "O XML contém uma declaração não permitida.",
        );
      },
    );

    it(
      "rejeita quantidade inválida",
      () => {
        const xml =
          XML_VALIDO.replace(
            "<qCom>10.000</qCom>",
            "<qCom>0</qCom>",
          );

        expect(() =>
          lerProdutosNfeXml(
            xml,
          ),
        ).toThrow(
          "O produto 1 não possui nome, quantidade ou custo válidos.",
        );
      },
    );
  },
);

describe(
  "gerarOperacaoIdNfe",
  () => {
    it(
      "gera sempre o mesmo identificador para o mesmo item",
      async () => {
        const primeiro =
          await gerarOperacaoIdNfe(
            CHAVE_NFE,
            "568-0",
          );

        const segundo =
          await gerarOperacaoIdNfe(
            CHAVE_NFE,
            "568-0",
          );

        expect(
          primeiro,
        ).toBe(segundo);

        expect(
          primeiro,
        ).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      },
    );

    it(
      "gera identificadores diferentes para itens diferentes",
      async () => {
        const primeiro =
          await gerarOperacaoIdNfe(
            CHAVE_NFE,
            "568-0",
          );

        const segundo =
          await gerarOperacaoIdNfe(
            CHAVE_NFE,
            "597-1",
          );

        expect(
          primeiro,
        ).not.toBe(
          segundo,
        );
      },
    );

    it(
      "rejeita uma chave inválida",
      async () => {
        await expect(
          gerarOperacaoIdNfe(
            "123",
            "568-0",
          ),
        ).rejects.toThrow(
          "Não foi possível identificar o item da NF-e.",
        );
      },
    );
  },
);