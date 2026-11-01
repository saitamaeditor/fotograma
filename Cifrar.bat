@echo off
chcp 65001 >nul
title Cifrar videos de MorvehTV
rem Cifra los videos del catalogo que aun no lo estan (HLS + AES-128) y los deja listos en morvehtv.es.
rem Necesita ffmpeg y el archivo api\.env. Puede tardar: descarga cada video, lo cifra y lo vuelve a subir.
cd /d "%~dp0api"
echo.
echo  === Cifrar videos de MorvehTV ===
echo.
node --env-file=.env scripts\cifrar.mjs
echo.
pause
