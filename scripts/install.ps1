# 허리 요정을 윈도우 작업 스케줄러에 등록한다.
# 로그인하면 자동으로 뜨고, 죽어 있으면 5분 안에 다시 살아난다.
#
# macOS 의 launchd KeepAlive 에 해당하는 것이 윈도우에는 없어서,
# "로그온 시 시작" + "5분마다 반복 실행 + 중복 실행 무시" 조합으로 같은 효과를 낸다.
# 이미 돌고 있으면 새 인스턴스가 무시되고, 죽어 있으면 다음 반복 때 살아난다.

$ErrorActionPreference = "Stop"

$TaskName  = "fairy-of-spine"
$RepoDir   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FairyHome = if ($env:FAIRY_HOME) { $env:FAIRY_HOME } else { Join-Path $env:USERPROFILE ".fairy-of-spine" }
$LogDir    = Join-Path $FairyHome "logs"
$LogFile   = Join-Path $LogDir "fairy.log"

# ── 준비 확인 ────────────────────────────────────────────────
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Error "node 를 찾을 수 없습니다. Node.js 24 이상을 설치해주세요."
}

$nodeMajor = [int](& $node -p 'process.versions.node.split(".")[0]')
if ($nodeMajor -lt 24) {
  Write-Error "Node.js 24 이상이 필요합니다 (현재 v$nodeMajor). TypeScript 를 빌드 없이 실행하기 위해서입니다."
}

if (-not (Test-Path (Join-Path $RepoDir ".env"))) {
  Write-Error ".env 가 없습니다. 먼저 'copy .env.example .env' 후 토큰을 채워주세요."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── 실행 래퍼 생성 ───────────────────────────────────────────
# 리다이렉션 따옴표를 .cmd 안에 가둬두면 VBS/스케줄러 쪽 인용 지옥을 피할 수 있다.
$cmdPath = Join-Path $FairyHome "fairy.cmd"
@"
@echo off
cd /d "$RepoDir"
"$node" "$RepoDir\src\index.ts" >> "$LogFile" 2>&1
"@ | Set-Content -Path $cmdPath -Encoding OEM

# 콘솔 창이 뜨지 않게 VBS 로 감싼다. Run 의 세 번째 인자 0 이 "숨김"이다.
# 사용자명이 한글인 경로(C:\Users\로건\...)도 깨지지 않도록 UTF-16 으로 쓴다.
# WSH 는 BOM 을 보고 알아서 판별한다.
$vbsPath = Join-Path $FairyHome "fairy.vbs"
@"
CreateObject("WScript.Shell").Run """$cmdPath""", 0, False
"@ | Set-Content -Path $vbsPath -Encoding Unicode

# ── 작업 등록 ────────────────────────────────────────────────
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument """$vbsPath""" -WorkingDirectory $RepoDir

$atLogon = New-ScheduledTaskTrigger -AtLogOn
# 감시용 반복 트리거. 죽어 있으면 여기서 되살아난다.
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName `
  -Action $action `
  -Trigger @($atLogon, $watchdog) `
  -Settings $settings `
  -Description "허리 펴라고 알려주는 척추의 요정" | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "OK 등록 완료: $TaskName"
Write-Host "   작업     : 작업 스케줄러 > 작업 스케줄러 라이브러리 > $TaskName"
Write-Host "   로그     : $LogFile"
Write-Host ""
Write-Host "봇에게 /start 를 보내면 알림이 시작됩니다."
Write-Host "로그 보기: npm run service:logs"
