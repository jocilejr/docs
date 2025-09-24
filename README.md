# Documentação da API WhatsApp

Este repositório contém a especificação OpenAPI para operações de autenticação via QR Code, gerenciamento de instâncias e envio de mensagens utilizando Baileys.

## Estrutura

- `docs/swagger/openapi.yaml`: definição completa da API no formato OpenAPI 3.0.3.
- `frontend/baileys-service.js`: serviço HTTP que integra com o Baileys e expõe as rotas documentadas.
- `frontend/data/`: diretório de persistência de instâncias e credenciais das sessões Baileys.

## Como validar a especificação

1. Instale as dependências necessárias (caso ainda não possua o pacote):

   ```bash
   pip install openapi-spec-validator
   ```

2. Execute a validação do arquivo:

   ```bash
   python -m openapi_spec_validator docs/swagger/openapi.yaml
   ```

O comando deve ser executado na raiz do repositório.

## Executando o serviço Baileys

O arquivo `frontend/baileys-service.js` implementa um servidor Express que:

- inicializa sessões do WhatsApp utilizando `@whiskeysockets/baileys`;
- persiste credenciais em `frontend/data/sessions/<instanceId>/` e o catálogo de instâncias em `frontend/data/instances.json`;
- expõe as rotas `GET /qrcode`, CRUD de `/instances` e `POST /messages`, seguindo os schemas definidos em `docs/swagger/openapi.yaml`;
- exige autenticação Bearer quando a variável `API_BEARER_TOKEN` estiver definida.

### Pré-requisitos

- Node.js 18+ (necessário para o runtime do serviço e suporte ao `fetch` nativo utilizado pelo Baileys);
- npm para instalação das dependências do diretório `frontend/`;
- acesso de escrita ao diretório `frontend/data/` para persistir credenciais e metadados das instâncias.

### Configuração

1. Instale as dependências:

   ```bash
   cd frontend
   npm install
   ```

2. (Opcional) Defina um token para proteger as rotas HTTP:

   ```bash
   export API_BEARER_TOKEN="coloque-um-token-seguro"
   ```

3. Inicie o serviço (a porta pode ser ajustada via `BAILEYS_PORT`):

   ```bash
   BAILEYS_PORT=3002 node baileys-service.js
   ```

O serviço criará automaticamente as estruturas necessárias em `frontend/data/`. Os arquivos dentro de `frontend/data/sessions/` contêm as credenciais criptografadas do Baileys para cada instância e **não devem ser versionados**. Para produção, mantenha esse diretório em um volume persistente e proteja os arquivos com permissões adequadas.

## Automatizando a preparação do front-end

Utilize o script `installer.py` para configurar um front-end que consome os serviços descritos nesta documentação e garantir que o pacote `baileys` será instalado.

> 💡 Este repositório inclui um exemplo mínimo em `frontend/` com `package.json`, scripts de build/start e um serviço `baileys-service.js`. Use-o para validar o fluxo do instalador ou como referência para adaptar o seu projeto.

### Pré-requisitos

- Python 3.8+
- Node.js e npm disponíveis no `PATH`
- Diretório do front-end com um `package.json`

### Uso básico

```bash
# Use o projeto de exemplo
python installer.py --frontend-path frontend/

# OU aponte para um projeto Node.js existente
python installer.py --frontend-path caminho/para/seu/projeto
```

O comando acima executa uma sequência de etapas no diretório informado:

1. **Validação do ambiente Node.js** – garante que `node` e `npm` estão disponíveis, pois são obrigatórios para gerenciar o front-end.
2. **Instalação de dependências** – roda `npm install` para baixar as dependências do projeto e, em seguida, força a instalação do pacote `baileys` com `npm install baileys` para assegurar sua presença.
3. **Build do front-end** – executa `npm run build`, permitindo que você rode qualquer processo de build definido no seu `package.json` (no exemplo incluso, apenas imprime uma mensagem).
4. **Inicialização do front-end** – aciona `npm run start`, útil para levantar o servidor do seu aplicativo (o exemplo disponibiliza um servidor HTTP simples).
5. **Serviço Baileys auxiliar** – inicia `node baileys-service.js` (ou o comando definido via `--baileys-command`) com a variável `BAILEYS_PORT` apontando para a porta especificada, simulando a camada de integração com o Baileys.

O script aguarda a finalização das execuções iniciadas; encerre com `Ctrl+C` quando não forem mais necessárias.

### Parâmetros disponíveis

- `--frontend-path`: caminho para o diretório do front-end (padrão: `frontend`). Se você não possui um projeto próprio, utilize o exemplo incluso ou ajuste este caminho para apontar para o seu projeto Node.js.
- `--port`: porta utilizada pelo serviço Baileys (padrão: `3002`).
- `--baileys-command`: substitui o comando padrão (`node baileys-service.js`). Informe após a flag todo o comando que deseja executar.
- `--skip-build`, `--skip-start`, `--skip-baileys`: permitem pular etapas específicas do fluxo padrão.
- `--log-level`: define o nível de log exibido (`CRITICAL`, `ERROR`, `WARNING`, `INFO`, `DEBUG`).

### Ajustando o serviço Baileys

Por padrão, o script espera encontrar um arquivo `baileys-service.js` dentro do diretório do front-end que inicialize o serviço Baileys e utilize a variável `process.env.BAILEYS_PORT`. Caso utilize outro arquivo ou comando, informe-o por meio da flag `--baileys-command`. Exemplo:

```bash
python installer.py --frontend-path frontend/ --baileys-command node scripts/meu-servico-baileys.js
```

## Como visualizar a documentação Swagger

Você pode utilizar qualquer visualizador de OpenAPI. Algumas opções:

### Painel interativo embutido

O arquivo `frontend/public/index.html` inclui o Swagger UI acompanhado de um painel "Painel interativo Baileys" que consome as
mesmas rotas documentadas via `fetch`.

1. Sirva o diretório `frontend/public/` em um servidor estático (por exemplo, `npx http-server frontend/public`).
2. Acesse a página gerada e aguarde o carregamento do Swagger UI.
3. No painel lateral:
   - escolha o servidor desejado (as opções são preenchidas com os `servers` do OpenAPI);
   - crie instâncias informando o `id` e, opcionalmente, metadados;
   - recupere o QR Code renderizado diretamente (quando retornado como Base64) ou como link externo;
   - envie mensagens preenchendo o payload conforme a rota `POST /messages`.
4. Caso utilize autenticação Bearer pelo botão "Authorize" do Swagger UI, o token é reutilizado automaticamente nas chamadas do
   painel.

### Swagger UI local

1. Instale o pacote do Swagger UI:

   ```bash
   npx -y http-server swagger-ui-dist
   ```

2. Abra o Swagger UI e informe o caminho do arquivo `docs/swagger/openapi.yaml`.

Alternativamente, faça o download do [Swagger UI](https://github.com/swagger-api/swagger-ui) e abra o arquivo `index.html`, configurando a variável `url` para `docs/swagger/openapi.yaml`.

### Redoc CLI

1. Instale o Redoc CLI:

   ```bash
   npm install -g @redocly/cli
   ```

2. Renderize a documentação localmente:

   ```bash
   redocly preview-docs docs/swagger/openapi.yaml
   ```

A saída exibirá o endereço local para visualização da documentação em um navegador.
