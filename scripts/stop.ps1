# ============================================================
#  Dádiva Go — Parar todos os serviços de desenvolvimento
#  Uso: .\stop.ps1 | .\scripts\stop.ps1
#       -KeepDocker   (mantém o container PostgreSQL)
# ============================================================
param([switch]$KeepDocker)

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

function Write-Step { param($msg) Write-Host "`n► $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

# ── Sessao registada pelo dev.bat ──────────────────────────
Write-Step "A encerrar sessao registada..."

$tmpDir  = Join-Path $env:TEMP "dadivago-dev"
$pidFile = Join-Path $tmpDir "session-pids.json"

function Kill-Tree {
    param([int]$procId)
    taskkill /F /T /PID $procId 2>$null | Out-Null
}

if (Test-Path $pidFile) {
    $saved  = Get-Content $pidFile | ConvertFrom-Json
    $killed = 0
    foreach ($p in @($saved.api, $saved.front, $saved.ai)) {
        if ($p -and $p -gt 0) {
            Kill-Tree ([int]$p)
            $killed++
        }
    }
    Remove-Item $pidFile -Force
    Write-Ok "$killed arvore(s) de processos encerrada(s)."
} else {
    Write-Warn "Nenhuma sessao registada encontrada."
}

# Fallback: matar processos residuais nas portas 3000/4000
Write-Step "A verificar portas residuais 3000 e 4000..."
foreach ($port in @(3000, 4000)) {
    $portPids = @(netstat -ano 2>$null |
        Select-String -Pattern "TCP\s+.*:$port\s+.*LISTENING" |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique)

    foreach ($procId in $portPids) {
        Kill-Tree ([int]$procId)
        Write-Ok "Processo residual PID $procId na porta $port encerrado."
    }
}

if (-not (netstat -ano 2>$null | Select-String "TCP.*:3000.*LISTENING|TCP.*:4000.*LISTENING")) {
    Write-Ok "Portas 3000 e 4000 livres."
}

# ── Docker (PostgreSQL) ────────────────────────────────────
if (-not $KeepDocker) {
    Write-Step "A parar container PostgreSQL..."
    $pg = docker ps --filter "name=dadiva-postgres" --filter "status=running" -q 2>$null
    if ($pg) {
        Push-Location "backend"
        docker compose stop postgres
        Pop-Location
        Write-Ok "Container PostgreSQL parado (dados preservados)."
    } else {
        Write-Warn "Container dadiva-postgres não estava em execução."
    }
} else {
    Write-Ok "PostgreSQL mantido em execução (-KeepDocker)."
}

Write-Host ""
Write-Host "  Todos os serviços parados." -ForegroundColor Green
Write-Host "  Para retomar: .\dev.ps1" -ForegroundColor DarkGray
Write-Host ""
