"use strict";
/*
GESTAO DE COZINHA — limpeza operacional
Coloque em scripts/resetar-dados.cjs, na pasta do projeto.
Previa (somente leitura): node scripts/resetar-dados.cjs
Execucao: node scripts/resetar-dados.cjs --executar --projeto ID_EXIBIDO_NA_PREVIA

Usa .env.local (via @next/env) ou .secrets/firebase-admin.json.
Nao publique este script como rota de API. Nao envie credenciais ou backups.
Feche o sistema em todos os dispositivos durante a execucao. Os lotes nao sao
uma unica transacao global: falhas podem deixar limpeza parcial. Guarde o backup.
O backup cobre os documentos afetados, nao e exportacao integral do Firebase.
Nao apaga Firebase Authentication, cadastros, indices nem colecoes desconhecidas.
*/
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline/promises");

const APAGAR = Object.freeze([
  "transferenciasEstoque", "movimentacoesEstoque", "consumosEstoqueCozinha",
  "ordensProducao", "retiradasMassa", "producaoFeiras",
  "planejamentosFeira", "saidasFeira", "fechamentosFeira",
  "reaproveitamentosFeira", "saldoSobrasFeira",
  "descartesFeira", "movimentosDescarteFeira", "movimentacoesBar",
]);
const ZERAR = Object.freeze(["estoquePrincipal", "estoqueCozinha", "bebidasBar"]);
const PRESERVAR = Object.freeze([
  "perfis", "funcionarios", "feirasCadastradas", "fornecedores",
  "fornecedoresDocumentos", "fichasTecnicas", "inventarioConfig",
  "bebidasBarNomes", "bebidasBarCodigos",
]);
const ALVOS = [...APAGAR, ...ZERAR];

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"].map(t => partes.find(p => p.type === t).value).join("-");
}

function camposZerados(colecao, dado, hoje = hojeBrasil()) {
  if (colecao === "bebidasBar") {
    if (!Number.isSafeInteger(dado.saldo) || dado.saldo < 0) {
      throw new Error("Saldo de bebida invalido; revise o cadastro antes da limpeza.");
    }
    const versao = Number.isSafeInteger(dado.versao) ? dado.versao : 0;
    if (!Number.isSafeInteger(versao + 1)) throw new Error("Versao de bebida invalida.");
    return { saldo: 0, versao: versao + 1, atualizadoEm: new Date() };
  }
  if (!["estoquePrincipal", "estoqueCozinha"].includes(colecao)) {
    throw new Error("Colecao fora da lista de saldos.");
  }
  if (!Number.isFinite(dado.quantidade) || typeof dado.validade !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dado.validade)) {
    throw new Error("Produto com quantidade ou validade invalida; revise antes da limpeza.");
  }
  const dias = (Date.parse(dado.validade + "T12:00:00Z") -
    Date.parse(hoje + "T12:00:00Z")) / 86400000;
  if (!Number.isFinite(dias)) throw new Error("Validade invalida.");
  return {
    quantidade: 0,
    situacao: dado.validade < hoje ? "vencido" :
      dias <= 7 ? "proximo-vencimento" : "estoque-baixo",
  };
}

// Codec explicito: preserva timestamps com nanossegundos e demais tipos do Firestore.
// Cada valor recebe um tipo; objetos do usuario nao colidem com marcadores.
function codificar(v, tipos) {
  if (v === null) return ["null"];
  if (typeof v === "string" || typeof v === "boolean") return [typeof v, v];
  if (typeof v === "number") {
    return ["number", Number.isNaN(v) ? "NaN" :
      v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" :
      Object.is(v, -0) ? "-0" : v];
  }
  if (v instanceof tipos.Timestamp) return ["timestamp", v.seconds, v.nanoseconds];
  if (v instanceof tipos.GeoPoint) return ["geopoint", v.latitude, v.longitude];
  if (v instanceof tipos.DocumentReference) return ["reference", v.path];
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return ["bytes", Buffer.from(v).toString("base64")];
  if (v instanceof Date) return ["date", v.toISOString()];
  if (Array.isArray(v)) return ["array", v.map(item => codificar(item, tipos))];
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return ["object", Object.entries(v).map(([k, item]) => [k, codificar(item, tipos)])];
  }
  throw new Error("Tipo de dado nao suportado pelo backup. Nenhum dado sera apagado.");
}

function decodificar(v, tipos, db) {
  switch (v[0]) {
    case "null": return null;
    case "string": case "boolean": return v[1];
    case "number": return typeof v[1] === "number" ? v[1] : Number(v[1]);
    case "timestamp": return new tipos.Timestamp(v[1], v[2]);
    case "geopoint": return new tipos.GeoPoint(v[1], v[2]);
    case "reference": return db.doc(v[1]);
    case "bytes": return Buffer.from(v[1], "base64");
    case "date": return new Date(v[1]);
    case "array": return v[1].map(item => decodificar(item, tipos, db));
    case "object": return Object.fromEntries(v[1].map(([k, item]) => [k, decodificar(item, tipos, db)]));
    default: throw new Error("Tipo desconhecido no backup.");
  }
}

function gravarSeguro(arquivo, conteudo) {
  const fd = fs.openSync(arquivo, "wx", 0o600);
  try { fs.writeFileSync(fd, conteudo, "utf8"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  if (fs.readFileSync(arquivo, "utf8") !== conteudo) throw new Error("Falha ao verificar backup.");
}

async function lerColecao(db, nome) {
  const documentos = [];
  let ultimo;
  for (;;) {
    let consulta = db.collection(nome).orderBy("__name__").limit(300);
    if (ultimo) consulta = consulta.startAfter(ultimo);
    const pagina = await consulta.get();
    documentos.push(...pagina.docs);
    if (pagina.size < 300) break;
    ultimo = pagina.docs[pagina.docs.length - 1];
  }
  return documentos;
}

async function aplicarLotes(db, operacoes, registrar) {
  for (let i = 0; i < operacoes.length; i += 100) {
    const lote = db.batch();
    const grupo = operacoes.slice(i, i + 100);
    for (const op of grupo) {
      const condicao = { lastUpdateTime: op.documento.updateTime };
      if (!condicao.lastUpdateTime) throw new Error("Documento sem versao; operacao interrompida.");
      if (op.acao === "apagar") lote.delete(op.documento.ref, condicao);
      else lote.update(op.documento.ref, op.campos, condicao);
    }
    await lote.commit();
    registrar(grupo.map(op => op.documento.ref.path));
  }
}

async function main() {
  const argumentos = process.argv.slice(2);
  const executar = argumentos.includes("--executar");
  const indice = argumentos.indexOf("--projeto");
  const esperado = indice >= 0 ? argumentos[indice + 1] : null;
  const permitidos = new Set(["--executar", "--projeto", esperado].filter(Boolean));
  if (argumentos.some(a => !permitidos.has(a)) ||
      (indice >= 0 && (!esperado || esperado.startsWith("--")))) {
    throw new Error("Uso: node scripts/resetar-dados.cjs [--executar --projeto ID]");
  }
  const raiz = process.cwd();
  if (!fs.existsSync(path.join(raiz, "package.json"))) {
    throw new Error("Execute na pasta raiz do projeto gestao-cozinha1.");
  }
  require("@next/env").loadEnvConfig(raiz);
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Emulador configurado. Este procedimento e para o Firebase publicado.");
  }
  const { cert, initializeApp, deleteApp } = require("firebase-admin/app");
  const tipos = require("firebase-admin/firestore");
  const vars = [
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim(),
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim(),
    process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  ];
  let credencial;
  if (vars.some(Boolean)) {
    if (!vars.every(Boolean)) throw new Error("Variaveis FIREBASE_ADMIN incompletas.");
    credencial = { projectId: vars[0], clientEmail: vars[1], privateKey: vars[2].replace(/\\n/g, "\n") };
  } else {
    const arquivo = path.join(raiz, ".secrets", "firebase-admin.json");
    if (!fs.existsSync(arquivo)) throw new Error("Credenciais locais nao encontradas. Nao envie chaves pelo chat.");
    credencial = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  }
  const projeto = credencial.projectId || credencial.project_id;
  const publico = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projeto || !publico || publico !== projeto) {
    throw new Error("O projeto Admin precisa corresponder ao NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  }
  if (executar && esperado !== projeto) {
    throw new Error("Informe --projeto com o ID exato mostrado na previa.");
  }
  const app = initializeApp({ credential: cert(credencial), projectId: projeto }, "limpeza-operacional");
  const db = tipos.getFirestore(app);
  try {
    console.log("\nProjeto Firebase:", projeto);
    console.log("Modo:", executar ? "EXECUCAO (backup antes das alteracoes)" : "PREVIA — nenhuma gravacao no Firebase");
    const raizes = await db.listCollections();
    console.log("Colecoes preservadas:", raizes.filter(c => !ALVOS.includes(c.id)).map(c => c.id).join(", "));
    const desconhecidas = raizes.filter(c => !ALVOS.includes(c.id) && !PRESERVAR.includes(c.id)).map(c => c.id);
    if (desconhecidas.length) {
      console.log("ATENCAO: colecoes ainda nao classificadas:", desconhecidas.join(", "));
      if (executar) throw new Error("Revise as colecoes nao classificadas antes de executar.");
    }
    const operacoes = [];
    const resumo = [];
    for (const nome of ALVOS) {
      const documentos = await lerColecao(db, nome);
      resumo.push({ colecao: nome, documentos: documentos.length, acao: APAGAR.includes(nome) ? "apagar registros" : "zerar saldo" });
      for (const documento of documentos) {
        // Detecta estrutura inesperada antes de qualquer exclusao; nao deixa filhos orfaos.
        if ((await documento.ref.listCollections()).length) {
          throw new Error("Subcolecao encontrada em " + documento.ref.path + ". Precisa de revisao antes da limpeza.");
        }
        operacoes.push({
          documento,
          acao: APAGAR.includes(nome) ? "apagar" : "zerar",
          ...(ZERAR.includes(nome) ? { campos: camposZerados(nome, documento.data()) } : {}),
        });
      }
    }
    console.table(resumo);
    console.log("Total de documentos afetados:", operacoes.length);
    if (!executar) {
      console.log("\nPrevia concluida. Confira se este ID e o mesmo projeto da Vercel.");
      console.log("Depois: node scripts/resetar-dados.cjs --executar --projeto " + projeto);
      return;
    }
    if (!operacoes.length) { console.log("Nao ha documentos para alterar."); return; }
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const resposta = await terminal.question(
        "\nFeche o sistema em TODOS os dispositivos e interrompa novas operacoes.\n" +
        "Para confirmar esta limpeza, digite ZERAR " + projeto + ": ",
      );
      if (resposta.trim() !== "ZERAR " + projeto) { console.log("Cancelado. Nenhum dado alterado."); return; }
    } finally { terminal.close(); }

    const pasta = path.join(raiz, ".secrets", "backups-operacionais");
    fs.mkdirSync(pasta, { recursive: true, mode: 0o700 });
    const nome = "antes-reset-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomUUID() + ".json";
    const arquivo = path.join(pasta, nome);
    const backup = {
      formato: "gestao-cozinha-operacional-v1", projeto,
      criadoEm: new Date().toISOString(), resumo,
      documentos: operacoes.map(op => ({
        caminho: op.documento.ref.path, acao: op.acao,
        versao: codificar(op.documento.updateTime, tipos),
        dados: codificar(op.documento.data(), tipos),
      })),
    };
    const conteudo = JSON.stringify(backup, null, 2);
    // Verifica que todos os registros sao decodificaveis antes de gravar no Firebase.
    const verificacao = JSON.parse(conteudo);
    for (const item of verificacao.documentos) decodificar(item.dados, tipos, db);
    gravarSeguro(arquivo, conteudo);
    gravarSeguro(arquivo + ".sha256", crypto.createHash("sha256").update(conteudo).digest("hex") + "\n");
    console.log("Backup verificado:", arquivo);
    const log = arquivo + ".progresso.jsonl";
    gravarSeguro(log, "");
    try {
      await aplicarLotes(db, operacoes, caminhos => {
        fs.appendFileSync(log, JSON.stringify({ confirmadoEm: new Date().toISOString(), caminhos }) + "\n");
        console.log("Lote confirmado:", caminhos.length, "documentos");
      });
      for (const nome of ALVOS) {
        const atuais = await lerColecao(db, nome);
        const originais = operacoes.filter(op => op.documento.ref.parent.id === nome);
        if (APAGAR.includes(nome) && atuais.length) throw new Error("Ainda ha registros em " + nome);
        if (ZERAR.includes(nome)) {
          const campo = nome === "bebidasBar" ? "saldo" : "quantidade";
          if (atuais.length !== originais.length || atuais.some(d => d.data()[campo] !== 0)) {
            throw new Error("Verificacao de saldo/cadastro falhou em " + nome);
          }
        }
      }
      fs.appendFileSync(log, JSON.stringify({ concluidoEm: new Date().toISOString(), verificado: true }) + "\n");
      console.log("\nLimpeza concluida e saldos verificados. Cadastros preservados.");
      console.log("Guarde o backup; nao o publique no Git. Nao importe novamente os registros antigos do navegador.");
      console.log("Padroes de feira definidos no codigo continuam disponiveis; isto e esperado.");
    } catch (erro) {
      console.error("\nLIMPEZA INTERROMPIDA: pode haver lotes ja aplicados. Nao reexecute automaticamente.");
      console.error("Backup:", arquivo, "\nProgresso:", log);
      throw erro;
    }
  } finally { await deleteApp(app); }
}

module.exports = { APAGAR, ZERAR, PRESERVAR, camposZerados, codificar, decodificar, aplicarLotes };
if (require.main === module) {
  main().catch(erro => {
    console.error("Erro:", erro.message);
    process.exitCode = 1;
  });
}
