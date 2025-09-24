#!/usr/bin/env python3
"""Installer and orchestrator script for the WhatsApp documentation project.

This script helps configure the front-end environment, ensure dependencies are
present and orchestrate build/start commands together with a Baileys service.
"""
from __future__ import annotations

import argparse
import logging
import os
import platform
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Iterable, List, Optional


DEFAULT_FRONTEND_PATH = "frontend"
DEFAULT_PORT = 3002
DEFAULT_BAILEYS_SCRIPT = "baileys-service.js"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Configura o front-end, garante dependências do Baileys e executa os "
            "serviços necessários."
        )
    )
    parser.add_argument(
        "--frontend-path",
        default=DEFAULT_FRONTEND_PATH,
        help=(
            "Diretório do front-end que deve conter um projeto Node.js. "
            "Padrão: '%(default)s'."
        ),
    )
    parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_PORT,
        help="Porta na qual o serviço Baileys será iniciado. Padrão: %(default)s.",
    )
    parser.add_argument(
        "--baileys-command",
        nargs=argparse.REMAINDER,
        help=(
            "Comando customizado para iniciar o serviço Baileys. Caso não seja "
            "fornecido, o script tentará executar 'node baileys-service.js' dentro "
            "do diretório do front-end."
        ),
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Ignora a execução de 'npm run build'.",
    )
    parser.add_argument(
        "--skip-start",
        action="store_true",
        help="Ignora a execução de 'npm run start'.",
    )
    parser.add_argument(
        "--skip-baileys",
        action="store_true",
        help="Ignora a inicialização do serviço Baileys.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"],
        help="Define o nível de log exibido durante a execução.",
    )
    return parser.parse_args()


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="[%(levelname)s] %(message)s",
    )


def ensure_node_and_npm() -> None:
    """Valida se Node.js e npm estão presentes na máquina."""
    node_path = shutil.which("node")
    npm_path = shutil.which("npm")
    if node_path and npm_path:
        logging.info("Node.js localizado em %s", node_path)
        logging.info("npm localizado em %s", npm_path)
        return

    system_name = platform.system()
    install_instructions = {
        "Linux": "Use o gerenciador de pacotes (ex.: sudo apt install nodejs npm)",
        "Darwin": "Instale via Homebrew: brew install node",
        "Windows": "Baixe em https://nodejs.org/ ou use winget install OpenJS.NodeJS",
    }
    message_lines = [
        "Node.js/npm não encontrados no PATH.",
        install_instructions.get(
            system_name,
            "Consulte https://nodejs.org/ para instruções específicas do seu sistema.",
        ),
    ]
    for line in message_lines:
        logging.error(line)
    raise SystemExit(
        "Instale o Node.js e o npm antes de executar novamente o installer."
    )


def run_command(command: Iterable[str], cwd: Optional[Path] = None) -> None:
    display_cmd = " ".join(command)
    logging.info("Executando comando: %s (cwd=%s)", display_cmd, cwd or os.getcwd())
    try:
        subprocess.run(command, cwd=cwd, check=True)
    except subprocess.CalledProcessError as exc:
        logging.error("Comando falhou com código %s: %s", exc.returncode, display_cmd)
        raise


def ensure_dependency(frontend_path: Path, package: str) -> None:
    logging.info("Garantindo dependência npm '%s'", package)
    run_command(["npm", "install", package], cwd=frontend_path)


def install_dependencies(frontend_path: Path) -> None:
    logging.info("Instalando dependências do front-end (npm install)")
    run_command(["npm", "install"], cwd=frontend_path)
    ensure_dependency(frontend_path, "baileys")


def run_build(frontend_path: Path) -> None:
    logging.info("Executando build do front-end")
    run_command(["npm", "run", "build"], cwd=frontend_path)


def run_start(frontend_path: Path) -> None:
    logging.info("Iniciando front-end (npm run start)")
    run_command(["npm", "run", "start"], cwd=frontend_path)


def get_baileys_command(args: argparse.Namespace, frontend_path: Path) -> List[str]:
    if args.baileys_command:
        return args.baileys_command
    script_path = frontend_path / DEFAULT_BAILEYS_SCRIPT
    if not script_path.exists():
        logging.warning(
            "Script padrão '%s' não encontrado em %s. Crie-o ou forneça "
            "--baileys-command.",
            DEFAULT_BAILEYS_SCRIPT,
            frontend_path,
        )
    return ["node", str(script_path)]


def run_baileys_service(args: argparse.Namespace, frontend_path: Path) -> None:
    env = os.environ.copy()
    env.setdefault("BAILEYS_PORT", str(args.port))
    command = get_baileys_command(args, frontend_path)
    logging.info(
        "Iniciando serviço Baileys na porta %s com comando: %s",
        args.port,
        " ".join(command),
    )
    try:
        subprocess.run(command, cwd=frontend_path, check=True, env=env)
    except subprocess.CalledProcessError as exc:
        logging.error(
            "Serviço Baileys terminou com código %s.",
            exc.returncode,
        )
        raise


def main() -> None:
    args = parse_args()
    configure_logging(args.log_level)

    frontend_path = Path(args.frontend_path).expanduser().resolve()
    logging.info("Diretório do front-end: %s", frontend_path)
    if not frontend_path.exists() or not frontend_path.is_dir():
        logging.error("Diretório do front-end não existe: %s", frontend_path)
        raise SystemExit(1)

    ensure_node_and_npm()
    install_dependencies(frontend_path)

    threads = []

    if not args.skip_build:
        run_build(frontend_path)
    else:
        logging.info("Build do front-end foi pulado pelo usuário.")

    if not args.skip_start:
        threads.append(
            threading.Thread(target=run_start, args=(frontend_path,), name="frontend-start")
        )
    else:
        logging.info("Inicialização do front-end foi pulada pelo usuário.")

    if not args.skip_baileys:
        threads.append(
            threading.Thread(
                target=run_baileys_service,
                args=(args, frontend_path),
                name="baileys-service",
            )
        )
    else:
        logging.info("Inicialização do serviço Baileys foi pulada pelo usuário.")

    for thread in threads:
        thread.start()

    try:
        for thread in threads:
            thread.join()
    except KeyboardInterrupt:
        logging.warning("Execução interrompida pelo usuário. Encerrando serviços.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit(1)
