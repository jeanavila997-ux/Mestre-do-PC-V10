$launcherDir = Join-Path $env:USERPROFILE 'Mestre-do-PC-V10-clean\v10'
$launcherScript = Join-Path $launcherDir 'launcher.js'

# Inicia o launcher em uma janela minimizada separada
Start-Process -FilePath 'node' -ArgumentList $launcherScript -WorkingDirectory $launcherDir -WindowStyle Minimized

Write-Output 'Aguardando o launcher iniciar...'
Start-Sleep -Seconds 3

# Tenta confirmar que subiu
try {
    $status = Invoke-WebRequest -Uri 'http://127.0.0.1:7777/status' -UseBasicParsing -TimeoutSec 5
    if ($status.StatusCode -eq 200) {
        Write-Output 'Launcher respondendo. Abrindo interface...'
    } else {
        Write-Output 'Launcher iniciado (status nao confirmado).'
    }
} catch {
    Write-Output 'Nao foi possivel confirmar o status, mas a interface sera aberta.'
}

# Abre o navegador padrao
Start-Process 'http://127.0.0.1:7777'
