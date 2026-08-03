#!/usr/bin/env bash
# 허리 요정을 macOS launchd 사용자 에이전트로 등록한다.
# 로그인하면 자동으로 뜨고, 죽으면 launchd 가 다시 살린다.
set -euo pipefail

LABEL="net.nextlevelstudio.fairy-of-spine"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIRY_HOME="${FAIRY_HOME:-$HOME/.fairy-of-spine}"
LOG_DIR="$FAIRY_HOME/logs"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
TEMPLATE="$REPO_DIR/launchd/$LABEL.plist.template"

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node 를 찾을 수 없습니다. Node.js 24 이상을 설치해주세요." >&2
  exit 1
fi

NODE_MAJOR="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 24 )); then
  echo "Node.js 24 이상이 필요합니다 (현재 v$NODE_MAJOR). TypeScript 를 빌드 없이 실행하기 위해서입니다." >&2
  exit 1
fi

if [[ ! -f "$REPO_DIR/.env" ]]; then
  echo ".env 가 없습니다. 먼저 아래를 실행하고 토큰을 채워주세요:" >&2
  echo "  cp $REPO_DIR/.env.example $REPO_DIR/.env" >&2
  exit 1
fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

# 이미 떠 있으면 먼저 내린다. (없으면 실패해도 무시)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

sed \
  -e "s|__LABEL__|$LABEL|g" \
  -e "s|__NODE__|$NODE_BIN|g" \
  -e "s|__WORKDIR__|$REPO_DIR|g" \
  -e "s|__LOGDIR__|$LOG_DIR|g" \
  -e "s|__PATH__|$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin|g" \
  "$TEMPLATE" > "$PLIST_PATH"

launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

echo "✅ 등록 완료: $LABEL"
echo "   plist : $PLIST_PATH"
echo "   로그  : $LOG_DIR/fairy.log"
echo
echo "봇에게 /start 를 보내면 알림이 시작됩니다."
echo "로그 보기: npm run service:logs"
