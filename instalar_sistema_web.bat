@echo off
title Instalador Automatico do Sistema Web
color 0A

echo ==========================================
echo   INSTALADOR AUTOMATICO DO SISTEMA WEB
echo   Next.js + Node.js + PostgreSQL + PM2
echo ==========================================
echo.

:: Verificar se Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao esta instalado.
    echo Instale o Node.js antes de continuar:
    echo https://nodejs.org
    pause
    exit /b 1
)

:: Instalar PM2 globalmente
echo [1/8] Instalando PM2...
call npm install -g pm2

:: Definir caminho base do sistema
set BASE_DIR=%~dp0
set BACKEND_DIR=%BASE_DIR%backend
set FRONTEND_DIR=%BASE_DIR%frontend

:: Verificar pasta backend
if not exist "%BACKEND_DIR%" (
    echo [ERRO] Pasta backend nao encontrada:
    echo %BACKEND_DIR%
    pause
    exit /b 1
)

:: Verificar pasta frontend
if not exist "%FRONTEND_DIR%" (
    echo [ERRO] Pasta frontend nao encontrada:
    echo %FRONTEND_DIR%
    pause
    exit /b 1
)

:: Instalar dependencias do backend
echo [2/8] Instalando dependencias do backend...
cd /d "%BACKEND_DIR%"
call npm install

:: Iniciar backend com PM2
echo [3/8] Iniciando backend...
if exist "server.js" (
    call pm2 start server.js --name backend
) else if exist "app.js" (
    call pm2 start app.js --name backend
) else (
    echo [AVISO] server.js ou app.js nao encontrado.
)

:: Instalar dependencias do frontend
echo [4/8] Instalando dependencias do frontend...
cd /d "%FRONTEND_DIR%"
call npm install

:: Gerar build do Next.js
echo [5/8] Gerando build do frontend...
call npm run build

:: Iniciar frontend com PM2
echo [6/8] Iniciando frontend...
call pm2 start npm --name frontend -- start

:: Salvar configuracao do PM2
echo [7/8] Salvando configuracao...
call pm2 save

:: Configurar inicializacao automatica no Windows
echo [8/8] Configurando inicializacao automatica...
call pm2 startup

echo.
echo ==========================================
echo INSTALACAO CONCLUIDA COM SUCESSO!
echo ==========================================
echo.
echo Frontend: http://localhost:3000
echo Backend : http://localhost:5000
echo.
echo IMPORTANTE:
echo Se o PM2 mostrar um comando apos "pm2 startup",
echo copie e execute esse comando no Prompt como Administrador.
echo.
echo Comandos uteis:
echo   pm2 list
echo   pm2 logs
echo   pm2 restart all
echo   pm2 stop all
echo.
pause
