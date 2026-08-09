# Valida backend/.env.prod no Windows (PowerShell).
# Uso: .\deploy\check-env-prod.ps1 [-EnvFile backend\.env.prod]

param(
    [string]$EnvFile = "backend\.env.prod"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path $EnvFile)) {
    Write-Host "ERRO: ficheiro nao encontrado: $EnvFile"
    Write-Host "Copie: Copy-Item backend\env.prod.sample backend\.env.prod"
    exit 1
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$') {
        $vars[$matches[1]] = $matches[2].Trim().Trim('"')
    }
}

$fail = 0
function Require-Key([string]$key) {
    if (-not $vars.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($vars[$key])) {
        Write-Host "✗ $key em falta"
        $script:fail++
    } else {
        Write-Host "✓ $key definido"
    }
}

Write-Host "== Validacao $EnvFile =="
Require-Key "POSTGRES_PASSWORD"
Require-Key "JWT_SECRET"
Require-Key "CORS_ORIGIN"
Require-Key "NEXT_PUBLIC_API_URL"
Require-Key "APP_PUBLIC_URL"
Require-Key "BOOTSTRAP_ADMIN_SECRET"

if ($vars["JWT_SECRET"] -and $vars["JWT_SECRET"].Length -lt 32) {
    Write-Host "✗ JWT_SECRET deve ter >= 32 caracteres"
    $fail++
}
if ($vars["CORS_ORIGIN"] -eq "*") {
    Write-Host "✗ CORS_ORIGIN nao pode ser *"
    $fail++
}

$mailOk = $false
if ($vars["RESEND_API_KEY"]) { $mailOk = $true }
$user = $vars["SMTP_USER"]; if (-not $user) { $user = $vars["EMAIL_USER"] }
$pass = $vars["SMTP_PASS"]; if (-not $pass) { $pass = $vars["EMAIL_PASS"] }
if ($user -and $pass) { $mailOk = $true }
if (-not $mailOk) {
    Write-Host "✗ Credenciais de email em falta (SMTP ou RESEND_API_KEY)"
    $fail++
} else {
    Write-Host "✓ credenciais de email presentes"
}

$mfa = $vars["MFA_REQUIRE_ADMIN"]
if ($mfa -eq "true" -or $mfa -eq "1") {
    Write-Host "✓ MFA_REQUIRE_ADMIN activo"
} else {
    Write-Host "· AVISO: MFA_REQUIRE_ADMIN nao activo (recomendado: true)"
}

Write-Host ""
if ($fail -gt 0) {
    Write-Host "Validacao FALHOU."
    exit 1
}
Write-Host "Validacao OK."
