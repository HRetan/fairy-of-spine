#!/usr/bin/env bash
# launchd 등록을 해제한다. 설정과 통계(~/.fairy-of-spine)는 남긴다.
set -euo pipefail

LABEL="net.nextlevelstudio.fairy-of-spine"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST_PATH"

echo "✅ 해제 완료: $LABEL"
echo "   설정과 기록은 ${FAIRY_HOME:-$HOME/.fairy-of-spine} 에 그대로 있습니다."
