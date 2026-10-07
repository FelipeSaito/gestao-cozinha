# Gestão de Cozinha

Sistema web para gerenciar estoque, produção de pastéis, transferências, feiras, bebidas e fornecedores.

Desenvolvido com Next.js, React, TypeScript e Firebase, com interface adaptada para computador, tablet e celular.

## Funcionalidades

### Estoque principal

- Cadastro de produtos e entrada de mercadorias.
- Importação de XML de nota fiscal.
- Controle de quantidades, lotes, validade e custo unitário.
- Cálculo de custo médio ponderado nas entradas.
- Busca e filtros por situação do estoque.
- Transferência de ingredientes para a cozinha.
- Bloqueio de transferências acima do saldo disponível e de produtos vencidos.

### Transferências

- Listagem de transferências pendentes.
- Conferência da quantidade recebida por item.
- Registro de divergências com justificativa obrigatória.
- Atualização do estoque da cozinha após o recebimento.
- Cancelamento de pendências com devolução ao estoque principal.
- Histórico de transferências.
- Bloqueio de recebimento ou cancelamento de transferências já encerradas.

A quantidade enviada sai do estoque principal na criação da transferência. A cozinha recebe somente a quantidade confirmada.

Diferenças entre o enviado e o recebido ficam registradas para apuração e não retornam automaticamente ao estoque principal.

### Estoque da cozinha

- Consulta dos ingredientes recebidos.
- Indicadores de estoque baixo, validade e valor estimado.
- Registro de consumo para produção.
- Vínculo do consumo com uma ordem de produção.
- Histórico de consumos recentes.
- Bloqueio de consumo acima do saldo disponível.

### Produção

- Gestão de ordens de produção.
- Registro de ingredientes consumidos.
- Registro dos resultados da produção.
- Controle de saldo nos freezers.
- Retirada de produtos para feiras.
- Cálculo do rendimento de massa.

O cálculo de massa utiliza as seguintes referências:

- Peso estimado por bloco: **1,53 kg**.
- Quantidade de rolos por saco: **3**.

O peso calculado é uma estimativa baseada na quantidade de blocos registrada.

### Feiras

- Cadastro e gerenciamento de feiras.
- Planejamento e acompanhamento dos produtos.
- Fechamento com vendas e sobras.
- Destinação de sobras para reaproveitamento.
- Registro de descartes.
- Controle do saldo disponível para novas destinações.

O saldo de sobras considera tanto as quantidades alocadas quanto as descartadas, impedindo destinações acima do total disponível.

### Bar

- Cadastro de bebidas e embalagens.
- Controle de código, fardo e estoque mínimo.
- Registro de entradas e saídas.
- Histórico de movimentações.
- Persistência dos cadastros e saldos no Firebase.

### Fornecedores

- Cadastro e edição de fornecedores.
- Dados de documento, contato, telefone e produtos.
- Controle de situação ativa.
- Persistência no Firebase.

### Equipe e relatórios

- Gestão de funcionários e perfis de acesso.
- Autenticação de funcionários.
- Relatórios para acompanhamento da operação.

## Tecnologias

- Next.js com App Router.
- React.
- TypeScript.
- Firebase Authentication.
- Cloud Firestore.
- Firebase Admin SDK nas APIs.
- Lucide React.
- CSS Modules.
- Vitest.
- ESLint.

## Perfis de acesso

Uma conta pode possuir mais de um perfil. Nesse caso, seus acessos correspondem à combinação das permissões desses perfis.

| Página | Dono | Administração | Produção | Feirantes |
|---|:---:|:---:|:---:|:---:|
| Estoque principal | Sim | Sim | — | — |
| Estoque da cozinha | Sim | — | Sim | — |
| Transferências | Sim | Sim | — | — |
| Produção | Sim | — | Sim | — |
| Bar | Sim | Sim | — | — |
| Fornecedores | Sim | Sim | — | — |
| Feiras | Sim | — | Sim | Sim |
| Relatórios | Sim | — | — | — |
| Equipe | Sim | — | — | — |

Esta tabela descreve o acesso às páginas definido em `src/lib/permissoes.ts`. As APIs também verificam a autorização das operações.

O cancelamento de transferências é permitido para Dono e Administração. O registro e a consulta de descartes na API são restritos ao Dono.

## Fluxo operacional

1. Registrar a entrada dos produtos no estoque principal.
2. Criar uma transferência para a cozinha.
3. Conferir o recebimento e justificar eventuais divergências.
4. Registrar o consumo dos ingredientes durante a produção.
5. Registrar o resultado da ordem de produção.
6. Controlar o armazenamento e as retiradas para feiras.
7. Registrar o fechamento da feira.
8. Destinar as sobras para reaproveitamento ou descarte.
9. Consultar os históricos e relatórios.

## Executar localmente

### Pré-requisitos

- Node.js compatível com as dependências do projeto.
- npm.
- Projeto Firebase configurado.
- Conta de acesso cadastrada com o perfil necessário.

### Instalação

```bash
git clone https://github.com/FelipeSaito/gestao-cozinha.git
cd gestao-cozinha
npm install
```

### Configuração do Firebase

Crie um arquivo `.env.local` na raiz do projeto.

Os nomes exatos das variáveis utilizadas devem corresponder aos acessos a `process.env` nestes arquivos:

- `src/lib/firebase.ts`: configuração do cliente Firebase.
- `src/lib/firebase-admin.ts`: configuração administrativa usada pelo servidor.

Configure o Firebase Authentication, o Cloud Firestore e as regras de acesso necessárias para o projeto.

As credenciais administrativas devem permanecer no servidor. Não publique a chave privada no README, no Git ou em variáveis com prefixo `NEXT_PUBLIC_`.

A instalação das dependências não cria automaticamente os perfis dos funcionários ou os dados do banco.

### Desenvolvimento

```bash
npm run dev
```

Abra:

```text
http://localhost:3000
```

### Testar no celular

Com computador e celular conectados à mesma rede Wi-Fi:

```bash
npm run dev -- --hostname 0.0.0.0
```

No celular, abra o endereço de rede mostrado no terminal:

```text
http://IP-DO-COMPUTADOR:3000
```

### Executar a versão compilada

```bash
npm run build
npm run start
```

Para acessar essa versão pela rede local:

```bash
npm run start -- --hostname 0.0.0.0
```

## Comandos de validação

### TypeScript

```bash
npx tsc --noEmit
```

### Testes automatizados

```bash
npm test
```

### Testes durante o desenvolvimento

```bash
npm run test:watch
```

### Análise de código

```bash
npm run lint
```

### Compilação de produção

```bash
npm run build
```

## Testes automatizados

Os testes atuais abrangem:

- Leitura de XML de nota fiscal.
- Validação e cálculos de estoque.
- Permissões de acesso.
- Transferência de estoque.
- Conferência de recebimento.
- Validação do formulário de transferência.
- Rendimento de massa.
- Saldo, descarte e alocação de sobras de feira.

Na validação local de **06/10/2026**, passaram **133 testes em 8 arquivos**, além do lint e do build com verificação de TypeScript.

## Testes manuais realizados

Os seguintes cenários foram confirmados na validação local:

- Persistência dos saldos após atualizar a página.
- Recebimento com divergência e justificativa.
- Cancelamento de transferência com devolução ao estoque principal.
- Consumo de ingredientes com redução do saldo da cozinha.
- Bloqueio de consumo acima do saldo disponível.
- Consumo vinculado à ordem de produção.
- Finalização da produção e proteção contra duplicação.
- Retirada para feira e bloqueio acima do saldo.
- Fechamento, reaproveitamento e descarte de sobras.
- Conferência de relatórios e permissões.
- Navegação e layout no celular.

Esses resultados descrevem os cenários testados na versão local e não substituem a validação de futuras alterações.

## Estrutura principal

```text
src/
  app/
    api/
    bar/
    equipe/
    estoque-cozinha/
    estoque-principal/
    feiras/
    fornecedores/
    login/
    producao/
    relatorios/
    transferencias/
  components/
    estoque/
    layout/
    transferencias/
    ui/
  contexts/
  hooks/
  lib/
  schemas/
  services/
  types/
```

- `app`: páginas e APIs.
- `components`: componentes de interface.
- `contexts`: estados compartilhados de autenticação e inventário.
- `hooks`: lógica da interface, incluindo conferência de recebimento.
- `lib`: cálculos, permissões, utilitários e testes.
- `schemas`: validações.
- `services`: acesso aos serviços e dados.
- `types`: tipos compartilhados.

## Comportamentos atuais da conferência

- **Salvar rascunho** mantém as edições somente enquanto a tela permanece aberta. O rascunho não persiste após recarregar a página.
- O campo de foto atualmente registra o nome do arquivo na interface. O upload e a persistência da imagem ainda não estão implementados nesse fluxo.

## Publicação

O projeto utiliza Vercel para hospedagem.

As variáveis de ambiente necessárias devem estar configuradas no ambiente de publicação.

Alterações locais aparecem no site hospedado somente após uma nova publicação. A aprovação do build local não confirma que essa versão já está disponível na Vercel.