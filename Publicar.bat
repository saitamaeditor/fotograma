@echo off
chcp 65001 >nul
title Publicar MorvehTV
rem Publica en GitHub y en https://morvehtv.es los cambios de la web, el panel y la API.
rem Doble clic y listo. Necesita Git, Node.js y el archivo .deploy-hook (no se sube a GitHub).
cd /d "%~dp0"
echo.
echo  === Publicar MorvehTV ===
echo.
git add -A
git diff --cached --quiet
if not errorlevel 1 goto sincambios
git status --short
echo.
set "MENSAJE=Cambios en la web"
set /p "MENSAJE=Describe el cambio (Enter = Cambios en la web): "
git commit -q -m "%MENSAJE%"
goto publicar
:sincambios
echo No hay cambios nuevos: se vuelve a publicar la ultima version.
:publicar
echo.
node scripts\publicar.mjs
echo.
pause
