@echo off
REM ============================================================
REM  Mestre do PC - Inicializador robusto
REM  Isola PS 5.1 e PS 7, permite segundo plano
REM ============================================================
REM  Usa powershell.exe (5.1) para nao herdar PSModulePath do PS 7
REM  -NoProfile evita lentidao; o perfil de correcao e dispensavel aqui
REM  pois limpamos PSModulePath explicitamente no script .ps1

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$env:PSModulePath = '%ProgramFiles%\WindowsPowerShell\Modules;%SystemRoot%\system32\WindowsPowerShell\v1.0\Modules'; ^
   & '%USERPROFILE%\Mestre-do-PC-V10-clean\v10\scripts\iniciar-mestre.ps1' %*"