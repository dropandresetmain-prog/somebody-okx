# Append cohort status every 5 minutes (orchestration only).
$log = Join-Path $PSScriptRoot "poll-log.txt"
$cohortLog = Join-Path $PSScriptRoot "cohort-runner.log"
$manifest = Join-Path $PSScriptRoot "run-manifest.jsonl"
while ($true) {
  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  $done = 0
  if (Test-Path $manifest) { $done = (Get-Content $manifest | Measure-Object -Line).Lines }
  $tail = ""
  if (Test-Path $cohortLog) { $tail = (Get-Content $cohortLog -Tail 3) -join " | " }
  $port = (netstat -ano | findstr ":3210" | findstr "LISTENING" | Select-Object -First 1)
  $line = "$ts done=$done/9 local3210=$([bool]$port) tail=$tail"
  Add-Content -Path $log -Value $line
  Start-Sleep -Seconds 300
}
