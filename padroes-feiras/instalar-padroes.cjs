const fs = require("node:fs");
const path = require("node:path");

function exigir(ok, mensagem) { if (!ok) throw new Error(mensagem); }
function trocarUma(fonte, busca, texto, descricao) {
  exigir(fonte.split(busca).length === 2, `Não encontrei um trecho único: ${descricao}. Nenhum arquivo foi alterado.`);
  return fonte.replace(busca, texto);
}
function configurarFeiras(fonte) {
  const modulo = '@/lib/planejamento-padrao-feiras';
  if (fonte.includes(modulo)) return fonte;
  const inicio = fonte.indexOf('const SABORES_CEREJEIRAS:');
  const fim = fonte.indexOf('function ReaproveitamentoFeira(');
  exigir(inicio >= 0 && fim > inicio && fonte.slice(inicio, fim).includes('function padraoDaFeira('),
    'A estrutura de src/app/feiras/page.tsx mudou. Nenhum arquivo foi alterado.');
  fonte = fonte.slice(0, inicio) + fonte.slice(fim);
  fonte = trocarUma(fonte, 'import styles from "./page.module.css";',
    'import { padraoDaFeira, temPadraoCompleto } from "' + modulo + '";\n\nimport styles from "./page.module.css";', 'importação de feiras');
  const chamada = 'padraoDaFeira(feira, planejamentos[chave] ?? [])';
  exigir(fonte.split(chamada).length === 3, 'Esperava duas chamadas do padrão em Feiras. Nenhum arquivo foi alterado.');
  fonte = fonte.split(chamada).join('padraoDaFeira(feira, planejamentos[chave] ?? [], dataSelecionada)');
  fonte = trocarUma(fonte,
    'Object.keys(COMPLEMENTOS_FEIRAS).includes(nomeNormalizado(feira.nome))',
    '!temPadraoCompleto(feira, dataSelecionada)', 'nome do botão');
  return fonte;
}
function configurarProducao(fonte) {
  const modulo = '@/lib/planejamento-padrao-feiras';
  if (fonte.includes(modulo)) return fonte;
  const inicio = fonte.indexOf('const PADRAO_CEREJEIRAS:');
  const fim = fonte.indexOf('const FEIRAS:');
  exigir(inicio >= 0 && fim > inicio, 'Não encontrei o padrão antigo em Produção. Nenhum arquivo foi alterado.');
  fonte = fonte.slice(0, inicio) + fonte.slice(fim);
  const fInicio = fonte.indexOf('function padraoDaFeira(');
  const fFim = fonte.indexOf('export default function ProducaoPasteisPage()');
  exigir(fInicio >= 0 && fFim > fInicio, 'Não encontrei a função antiga em Produção. Nenhum arquivo foi alterado.');
  fonte = fonte.slice(0, fInicio) + fonte.slice(fFim);
  fonte = trocarUma(fonte, 'import styles from "./page.module.css";',
    'import { padraoDaFeira } from "' + modulo + '";\n\nimport styles from "./page.module.css";', 'importação da produção');
  const padraoInicio = fonte.indexOf('  const padrao = useMemo(');
  const padraoFim = fonte.indexOf('  const temPadrao =', padraoInicio);
  exigir(padraoInicio >= 0 && padraoFim > padraoInicio, 'Não encontrei o cálculo do padrão em Produção. Nenhum arquivo foi alterado.');
  fonte = fonte.slice(0, padraoInicio) + `  const padrao = useMemo(() => padraoDaFeira({
    id: feiraSelecionada,
    nome: feirasDoDia.find(feira => feira.id === feiraSelecionada)?.nome ?? feiraSelecionada,
  }, [], data) ?? [], [feiraSelecionada, feirasDoDia, data]);

` + fonte.slice(padraoFim);
  // O padrão agora é compartilhado entre o planejamento e a produção.
  fonte = fonte.replace(/\/\*\s*\* Referência informada para a produção[\s\S]*?\*\//,
    '/* Padrões compartilhados entre o planejamento do Dono e a comparação da produção. */');
  fonte = fonte.replace(/^[ \t]*type SaborPlanejado,\r?\n/m, '');
  return fonte;
}
function configurarNomes(fonte) {
  const adicoes = [['palmito','Palmito'],['marguerita','Marguerita'],['margherita','Marguerita']]
    .filter(([nome]) => !new RegExp('"' + nome + '"\\s*:').test(fonte));
  if (!adicoes.length) return fonte;
  return trocarUma(fonte, 'const NOMES: Record<string, string> = {',
    'const NOMES: Record<string, string> = {\n' + adicoes.map(([a,b]) => `  "${a}": "${b}",`).join('\n'), 'dicionário de nomes');
}
try {
  const raiz = process.cwd();
  exigir(fs.existsSync(path.join(raiz, 'package.json')), 'Execute este comando na pasta gestao-cozinha1.');
  const mudancas = [
    ['src/app/feiras/page.tsx', configurarFeiras],
    ['src/app/producao/pasteis/page.tsx', configurarProducao],
    ['src/lib/nomesSabores.ts', configurarNomes],
  ].map(([arquivo, transformar]) => {
    const destino = path.join(raiz, arquivo);
    const original = fs.readFileSync(destino, 'utf8');
    const editado = transformar(original.replace(/\r\n/g, '\n'));
    return { arquivo, destino, original, editado };
  });
  const moduloDestino = path.join(raiz, 'src/lib/planejamento-padrao-feiras.ts');
  const modulo = fs.readFileSync(path.join(__dirname, 'planejamento-padrao-feiras.ts'), 'utf8');
  mudancas.push({ arquivo: 'src/lib/planejamento-padrao-feiras.ts', destino: moduloDestino,
    original: fs.existsSync(moduloDestino) ? fs.readFileSync(moduloDestino, 'utf8') : null, editado: modulo });
  const alteradas = mudancas.filter(item => item.original !== item.editado);
  if (!alteradas.length) { console.log('Os padrões já estão instalados.'); process.exit(0); }
  const backup = path.join(raiz, 'backups-padroes', new Date().toISOString().replace(/[:.]/g, '-'));
  // Todas as transformações são verificadas antes da primeira gravação no projeto.
  for (const item of alteradas) if (item.original !== null) {
    const copia = path.join(backup, item.arquivo);
    fs.mkdirSync(path.dirname(copia), { recursive: true });
    fs.writeFileSync(copia, item.original, 'utf8');
  }
  const gravadas = [];
  try {
    for (const item of alteradas) {
      fs.mkdirSync(path.dirname(item.destino), { recursive: true });
      gravadas.push(item);
      fs.writeFileSync(item.destino, item.editado, 'utf8');
    }
  } catch (erro) {
    for (const item of gravadas.reverse()) {
      if (item.original === null) fs.rmSync(item.destino, { force: true });
      else fs.writeFileSync(item.destino, item.original, 'utf8');
    }
    throw erro;
  }
  console.log('Padrões instalados nas telas de Feiras e Produção de pastéis.');
  console.log('Backup dos arquivos anteriores:', backup);
  console.log('Nenhum planejamento do Firebase foi alterado.');
  console.log('Agora execute npm run build e confira a tela de Feiras com a conta do Dono.');
} catch (erro) {
  console.error('Não foi possível instalar:', erro.message);
  process.exitCode = 1;
}
