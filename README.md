# Documentação da API WhatsApp

Este repositório contém a especificação OpenAPI para operações de autenticação via QR Code, gerenciamento de instâncias e envio de mensagens utilizando Baileys.

## Estrutura

- `docs/swagger/openapi.yaml`: definição completa da API no formato OpenAPI 3.0.3.

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

## Automatizando a preparação do front-end

Utilize o script `installer.py` para configurar um front-end que consome os serviços descritos nesta documentação e garantir que o pacote `baileys` será instalado.

### Pré-requisitos

- Python 3.8+
- Node.js e npm disponíveis no `PATH`
- Diretório do front-end com um `package.json`

### Uso básico

```bash
python installer.py --frontend-path frontend/
```

O comando acima irá:

1. Validar a presença do Node.js/npm.
2. Executar `npm install` no diretório informado.
3. Garantir que o pacote `baileys` está instalado como dependência (`npm install baileys`).
4. Executar `npm run build`.
5. Iniciar `npm run start` e, em paralelo, tentar iniciar `node baileys-service.js` dentro do diretório do front-end usando a porta `3002` via variável de ambiente `BAILEYS_PORT`.

O script aguarda a finalização das execuções iniciadas; encerre com `Ctrl+C` quando não forem mais necessárias.

### Parâmetros disponíveis

- `--frontend-path`: caminho para o diretório do front-end (padrão: `frontend`).
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
