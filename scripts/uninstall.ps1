# 작업 스케줄러 등록을 해제한다. 설정과 통계(저장소 안 data/)는 남긴다.

$ErrorActionPreference = "Stop"

$TaskName  = "fairy-of-spine"
$RepoDir   = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DataDir   = if ($env:FAIRY_DATA_DIR) { $env:FAIRY_DATA_DIR } else { Join-Path $RepoDir "data" }

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 설치할 때 만든 실행 래퍼만 지운다. config.json 과 logs 는 건드리지 않는다.
Remove-Item -Path (Join-Path $DataDir "fairy.cmd") -ErrorAction SilentlyContinue
Remove-Item -Path (Join-Path $DataDir "fairy.vbs") -ErrorAction SilentlyContinue

Write-Host "OK 해제 완료: $TaskName"
Write-Host "   설정과 기록은 $DataDir\config.json 에 그대로 있습니다."
