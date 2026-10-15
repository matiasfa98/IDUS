# scripts/get-token.ps1
# Usage:
#   .\scripts\get-token.ps1 -UserId user_3Jrtj88IUPEgIrtU6uQw6njXhl4
#   .\scripts\get-token.ps1                     # uses the default user below

param(
  [string]$UserId = "user_3Jrtj88IUPEgIrtU6uQw6njXhl4",
  [string]$BaseUrl = "http://127.0.0.1:4000",
  [string]$DevSecret = "dev-secret-change-me"
)

$resp = Invoke-RestMethod -Method Post `
  -Uri "$BaseUrl/dev/token" `
  -Headers @{ "x-dev-secret" = $DevSecret } `
  -ContentType "application/json" `
  -Body (@{ userId = $UserId } | ConvertTo-Json -Compress) `
  -DisableKeepAlive

Write-Output $resp.token