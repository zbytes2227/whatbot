#!/bin/sh
set -eu

SESSION_DIR="${WHATSAPP_SESSION_PATH:-/usr/src/app/whatsapp-sessions}"
LOG_DIR="${LOG_FILE_PATH:+$(dirname "$LOG_FILE_PATH")}"

mkdir -p "$SESSION_DIR" /usr/src/app/logs ${LOG_DIR:-}
chown -R node:node "$SESSION_DIR" /usr/src/app/logs ${LOG_DIR:-}

exec gosu node "$@"
