# SolKanban

Quadro de solicitações para organizar o trabalho relacionado ao SIENGE. Interface em português, responsiva e sem dependências de instalação.

## Executar

Na pasta do projeto:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

O site está inteiramente em `index.html`, com CSS e JavaScript incorporados. Não exige build, arquivos auxiliares nem requisições externas. Você pode abrir o HTML diretamente no navegador ou acessá-lo pelo servidor no mesmo ambiente. Para hospedar, publique apenas `index.html` em um serviço de arquivos estáticos com HTTPS.

## Funcionalidades

- Quatro etapas: Recebidas, Em análise, Em andamento e Concluídas.
- Cadastro, edição e exclusão com confirmação.
- Título, descrição, projeto, responsável, prioridade, prazo e referência SIENGE.
- Mudança de etapa por arraste no computador ou pelo campo Status no formulário, inclusive no celular e com teclado.
- Busca sem distinção de acentos e filtro por prioridade.
- Indicadores gerais de volume, andamento, conclusão e prazos vencidos. Os filtros afetam os cartões; os indicadores continuam mostrando o total do quadro.
- Dados locais persistidos automaticamente e atualizados entre abas da mesma origem.
- Exportação de todas as solicitações em JSON.
- Exemplos identificados no primeiro acesso. A remoção dos exemplos preserva os itens criados ou editados pelo usuário.

## Dados e limites desta versão

Em prévias que bloqueiam o armazenamento, o quadro continua funcionando com dados temporários em memória e um aviso permanente na interface. Nesse modo, fechar ou recarregar a prévia descarta as alterações; exporte um backup antes.

Fora desse modo, os dados ficam no `localStorage` do navegador, na chave `solkanban.v1`. São específicos do navegador e da origem (protocolo, domínio e porta). Limpar os dados do site ou usar outro navegador/origem não mantém o mesmo quadro. Exporte cópias regularmente. O arquivo JSON contém as solicitações completas; nesta versão a restauração exige uma operação manual, pois ainda não há importação pela interface.

Não há autenticação, banco de dados compartilhado, sincronização entre dispositivos ou conexão à API do SIENGE. A referência SIENGE é um campo de texto para organização local.

## Validação

O fluxo foi validado em Chromium com Playwright: carregamento, cadastro, persistência após recarregar, busca com acentos, filtros combinados, edição, mudança de status pelo formulário e por arraste, indicadores de prazo, exportação JSON, limpeza de exemplos, confirmação/cancelamento de exclusão, quadro vazio persistido e formulário em tela de 390 px. A versão autocontida também foi validada isoladamente, em iframe com scripts permitidos e armazenamento/formulários nativos bloqueados, sem requisições externas. Não há suíte de testes ou ferramentas de build requeridas para executar o site.
