# Emits AGENT_LOOP_TICK every 5m so the agent posts cohort status in chat.
$root = "C:\Dev\somebody-okx\docs\work\gate-evidence\model-comparison-2026-09-23"
$manifest = Join-Path $root "run-manifest.jsonl"
$log = Join-Path $root "cohort-runner-resume.log"
while ($true) {
  Start-Sleep -Seconds 300
  $done = 0
  if (Test-Path $manifest) { $done = (Get-Content $manifest | Measure-Object -Line).Lines }
  $tail = ""
  if (Test-Path $log) { $tail = (Get-Content $log -Tail 2) -join " " }
  $payload = @{ prompt = "Cohort 9-run poll: read run-manifest.jsonl and cohort-runner-resume.log tail; post a brief 5-minute status update to the user (done count, current run, terminal states). If manifest has 9 lines and COHORT RUNNER DONE, run extract summary and evidence commit per original brief."; done = $done; tail = $tail } | ConvertTo-Json -Compress
  Write-Output "AGENT_LOOP_TICK_cohort9 $payload"
}
