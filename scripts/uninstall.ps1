# 작업 스케줄러 등록을 해제한다. 설정과 통계(~/.fairy-of-spine/config.json)는 남긴다.

$ErrorActionPreference = "Stop"

$TaskName  = "fairy-of-spine"
$FairyHome = if ($env:FAIRY_HOME) { $env:FAIRY_HOME } else { Join-Path $env:USERPROFILE ".fairy-of-spine" }

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 설치할 때 만든 실행 래퍼만 지운다. config.json 과 logs 는 건드리지 않는다.
Remove-Item -Path (Join-Path $FairyHome "fairy.cmd") -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $FairyHome "fairy.vbs") -ErrorAction SilentlyContinue

Write-Host "OK 해제 완료: $TaskName"
Write-Host "   설정과 기록은 $FairyHome 에 그대로 있습니다."
