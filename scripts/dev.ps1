# ============================================================
#  Dadiva Go - Script de desenvolvimento (Windows PowerShell)
#  Uso: dev.bat | .\dev.ps1 | .\scripts\dev.ps1  +  -AI  -SkipDocker  -Migrate
# ============================================================
param(
    [switch]$AI,
    [switch]$SkipDocker,
    # Aplica prisma migrate deploy (omitido por defeito para arranque mais rápido)
    [switch]$Migrate
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot
$root = $repoRoot

function Write-Step { param($msg) Write-Host "" ; Write-Host ">> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   [AVISO] $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "   [ERRO] $msg" -ForegroundColor Red ; exit 1 }
function Test-Cmd   { param($c)   return [bool](Get-Command $c -ErrorAction SilentlyContinue) }

# ----------------------------------------------------------
# 1. Pre-requisitos
# ----------------------------------------------------------
Write-Step "A verificar pre-requisitos..."

if (-not (Test-Cmd "node")) { Write-Fail "Node.js nao encontrado. Instale em https://nodejs.org" }
if (-not (Test-Cmd "npm"))  { Write-Fail "npm nao encontrado." }

if (-not $SkipDocker -and -not (Test-Cmd "docker")) {
    Write-Warn "Docker nao encontrado no PATH - etapa PostgreSQL sera ignorada."
    Write-Warn "Garanta que o PostgreSQL esta em execucao, ou instale Docker em https://docker.com"
    $SkipDocker = $true
}

Write-Ok "Node.js $(node --version)  |  npm $(npm --version)"

# ----------------------------------------------------------
# 2. Ficheiros .env
# ----------------------------------------------------------
Write-Step "A verificar ficheiros de ambiente..."

if (-not (Test-Path "backend\api\.env")) {
    Copy-Item "backend\api\env.sample" "backend\api\.env"
    Write-Warn "Criado backend\api\.env a partir de env.sample - reveja os valores."
} else {
    Write-Ok "backend\api\.env existe."
}

if (-not (Test-Path ".env.local")) {
    Copy-Item ".env.example" ".env.local"
    Write-Ok "Criado .env.local a partir de .env.example."
} else {
    Write-Ok ".env.local existe."
}

if ($AI -and -not (Test-Path "backend\ai-service\.env")) {
    Copy-Item "backend\ai-service\env.sample" "backend\ai-service\.env"
    Write-Ok "Criado backend\ai-service\.env."
}

# ----------------------------------------------------------
# 3. Dependencias npm
# ----------------------------------------------------------
Write-Step "A verificar dependencias npm..."

if (-not (Test-Path "node_modules")) {
    Write-Warn "node_modules nao encontrado na raiz - a instalar..."
    npm install
    Write-Ok "Frontend instalado."
} else {
    Write-Ok "Frontend: node_modules presente."
}

if (-not (Test-Path "backend\api\node_modules")) {
    Write-Warn "node_modules nao encontrado em backend\api\ - a instalar..."
    Push-Location "backend\api"
    npm install
    Pop-Location
    Write-Ok "API instalada."
} else {
    Write-Ok "API: node_modules presente."
}

# ----------------------------------------------------------
# 4. PostgreSQL via Docker
# ----------------------------------------------------------
if (-not $SkipDocker) {
    Write-Step "A verificar Docker Desktop..."

    # Timeout curto — evita ficar preso se o engine estiver partido.
    $dockerOk = $false
    try {
        $job = Start-Job { docker info 2>$null | Out-Null; $LASTEXITCODE }
        $done = Wait-Job $job -Timeout 8
        if ($done -and ((Receive-Job $job) -eq 0)) { $dockerOk = $true }
        Remove-Job $job -Force -ErrorAction SilentlyContinue
    } catch {
        $dockerOk = $false
    }

    if (-not $dockerOk) {
        Write-Warn "Docker Desktop nao responde (timeout ou engine parado)."
        Write-Warn "Abra o Docker Desktop e aguarde ficar 'Running', ou use -SkipDocker."
        Write-Fail "Nao foi possivel contactar o Docker."
    }
    Write-Ok "Docker Desktop a responder."

    Write-Step "A iniciar PostgreSQL via Docker..."
    Push-Location "backend"

    $pgRunning = $null
    try {
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $pgRunning = docker ps --filter "name=dadiva-postgres" --filter "status=running" -q 2>$null
        $ErrorActionPreference = $prevEap
    } catch {
        $ErrorActionPreference = $prevEap
        Pop-Location
        Write-Fail "Falha ao consultar containers. Reinicie o Docker Desktop."
    }

    if ($pgRunning) {
        Write-Ok "Container dadiva-postgres ja esta em execucao."
    } else {
        docker compose up -d postgres
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Fail "docker compose up falhou."
        }
        Write-Ok "Container PostgreSQL iniciado."

        Write-Host "   Aguardando PostgreSQL..." -ForegroundColor DarkCyan
        $tries = 0
        do {
            Start-Sleep -Seconds 1
            $healthy = docker inspect --format "{{.State.Health.Status}}" dadiva-postgres 2>$null
            $tries++
        } while ($healthy -ne "healthy" -and $tries -lt 30)

        if ($healthy -ne "healthy") {
            Write-Fail "PostgreSQL nao ficou saudavel. Verifique: docker logs dadiva-postgres"
        }
        Write-Ok "PostgreSQL pronto."
    }

    Pop-Location
}

# ----------------------------------------------------------
# 5. Migracoes Prisma (opcional — use -Migrate)
# ----------------------------------------------------------
if ($Migrate) {
    Write-Step "A aplicar migracoes Prisma..."
    Push-Location "backend\api"
    try {
        $dbUrl = (Get-Content ".env" | Where-Object { $_ -match "^DATABASE_URL=" }) -replace "^DATABASE_URL=",""
        $env:DATABASE_URL = $dbUrl
        npx prisma migrate deploy
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Migracoes Prisma aplicadas."
        } else {
            Write-Warn "Migracoes terminaram com erro - verifique a BD."
        }
    } catch {
        Write-Warn "Nao foi possivel aplicar migracoes."
    }
    Pop-Location
} else {
    Write-Step "Migracoes Prisma..."
    Write-Ok "Ignoradas (rapido). Use .\scripts\dev.ps1 -Migrate quando precisar."
}
# ----------------------------------------------------------
# 6. Encerrar sessao anterior (arvore completa de processos)
# ----------------------------------------------------------
Write-Step "A encerrar sessao anterior..."

$tmpDir = Join-Path $env:TEMP "dadivago-dev"
New-Item -ItemType Directory -Force $tmpDir | Out-Null
$pidFile = Join-Path $tmpDir "session-pids.json"

function Kill-Tree {
    param([int]$procId)
    # taskkill /F /T mata o processo E todos os filhos (nest watcher + node server)
    taskkill /F /T /PID $procId 2>$null | Out-Null
}

if (Test-Path $pidFile) {
    try {
        $saved = Get-Content $pidFile | ConvertFrom-Json
        $killed = 0
        foreach ($p in @($saved.api, $saved.front, $saved.ai)) {
            if ($p -and $p -gt 0) {
                Kill-Tree ([int]$p)
                $killed++
            }
        }
        Remove-Item $pidFile -Force
        if ($killed -gt 0) {
            Write-Warn "$killed janela(s) anterior(es) encerrada(s)."
            Start-Sleep -Milliseconds 300
        }
    } catch {
        Write-Warn "Nao foi possivel ler ficheiro de sessao anterior - continuando."
    }
} else {
    Write-Ok "Nenhuma sessao anterior registada."
}

# Fallback: ainda matar processos nas portas 3000/4000 caso existam
foreach ($port in @(3000, 4000)) {
    $portPids = @(netstat -ano 2>$null |
        Select-String -Pattern "TCP\s+.*:$port\s+.*LISTENING" |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique)

    foreach ($procId in $portPids) {
        Kill-Tree ([int]$procId)
        Write-Warn "Processo residual PID $procId na porta $port encerrado."
    }
}

Start-Sleep -Milliseconds 200

# ----------------------------------------------------------
# 7. Criar scripts temporarios de arranque
# ----------------------------------------------------------
Write-Step "A preparar e abrir terminais..."

$apiScript   = Join-Path $tmpDir "run-api.ps1"
$frontScript = Join-Path $tmpDir "run-front.ps1"

Set-Content -Path $apiScript -Value @"
Set-Location '$root\backend\api'
Write-Host 'API NestJS (SWC) -> http://localhost:4000/api' -ForegroundColor Cyan
npm run start:dev
"@

Set-Content -Path $frontScript -Value @"
Set-Location '$root'
Write-Host 'Frontend Next.js (Turbopack) -> http://localhost:3000' -ForegroundColor Magenta
npm run dev
"@
# ----------------------------------------------------------
# 8. Abrir janelas e guardar PIDs
# ----------------------------------------------------------
$useWT = Test-Cmd "wt"
$sessionPids = @{ api = 0; front = 0; ai = 0 }

if ($useWT) {
    $wtArgs = @(
        "new-tab", "--title", "API NestJS",
        "--", "powershell", "-NoExit", "-File", $apiScript,
        ";", "new-tab", "--title", "Frontend Next",
        "--", "powershell", "-NoExit", "-File", $frontScript
    )

    if ($AI) {
        $aiScript = Join-Path $tmpDir "run-ai.ps1"
        Set-Content -Path $aiScript -Value @"
Set-Location '$root\backend\ai-service'
Write-Host 'AI FastAPI -> http://localhost:8000/docs' -ForegroundColor Green
if (Test-Path '.venv\Scripts\Activate.ps1') { .\.venv\Scripts\Activate.ps1 }
uvicorn app.main:app --reload --port 8000
"@
        $wtArgs += @(";", "new-tab", "--title", "AI FastAPI",
            "--", "powershell", "-NoExit", "-File", $aiScript)
    }

    $wtProc = Start-Process wt -ArgumentList $wtArgs -PassThru
    $sessionPids.api   = $wtProc.Id
    $sessionPids.front = $wtProc.Id
    Write-Ok "Windows Terminal aberto com separadores."
} else {
    $apiProc   = Start-Process powershell -ArgumentList "-NoExit", "-File", $apiScript -PassThru
    $sessionPids.api = $apiProc.Id
    Start-Sleep -Milliseconds 600

    $frontProc = Start-Process powershell -ArgumentList "-NoExit", "-File", $frontScript -PassThru
    $sessionPids.front = $frontProc.Id

    if ($AI) {
        $aiScript = Join-Path $tmpDir "run-ai.ps1"
        Set-Content -Path $aiScript -Value @"
Set-Location '$root\backend\ai-service'
Write-Host 'AI FastAPI -> http://localhost:8000/docs' -ForegroundColor Green
if (Test-Path '.venv\Scripts\Activate.ps1') { .\.venv\Scripts\Activate.ps1 }
uvicorn app.main:app --reload --port 8000
"@
        Start-Sleep -Milliseconds 600
        $aiProc = Start-Process powershell -ArgumentList "-NoExit", "-File", $aiScript -PassThru
        $sessionPids.ai = $aiProc.Id
    }

    Write-Ok "Janelas PowerShell abertas."
}

# Guardar PIDs para a proxima execucao poder encerrar correctamente
$sessionPids | ConvertTo-Json | Set-Content $pidFile

# ----------------------------------------------------------
# Resumo
# ----------------------------------------------------------
Write-Host ""
Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Dadiva Go - Ambiente de desenvolvimento iniciado" -ForegroundColor White
Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Frontend -> http://localhost:3000" -ForegroundColor Magenta
Write-Host "  API      -> http://localhost:4000/api" -ForegroundColor Cyan
Write-Host "  Health   -> http://localhost:4000/api/health" -ForegroundColor DarkCyan
if ($AI) {
    Write-Host "  AI Docs  -> http://localhost:8000/docs" -ForegroundColor Green
}
Write-Host "  DB       -> postgresql://dadiva:dadiva@localhost:5432/dadiva" -ForegroundColor DarkGray
Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
