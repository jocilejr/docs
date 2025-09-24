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
