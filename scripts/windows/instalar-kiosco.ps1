<#
.SYNOPSIS
  Prepara una PC con Windows como maquina POIPIU: arranque automatico, sin suspension y sin protector de pantalla.

.DESCRIPTION
  Ejecutar como Administrador, con la sesion del usuario que va a usar la maquina:
    powershell -ExecutionPolicy Bypass -File instalar-kiosco.ps1 -ExePath "C:\POIPIU\POIPIU.exe"

  Crea una tarea programada que abre POIPIU al iniciar sesion y la reinicia si se cierra por un error.
  Para que la maquina arranque sola hasta el juego, configura tambien el inicio de sesion automatico
  de Windows (ver docs/WINDOWS.md).
#>
param(
  [Parameter(Mandatory = $true)][string]$ExePath,
  [string]$TaskName = "POIPIU Kiosco"
)

$ErrorActionPreference = "Stop"
$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Ejecuta este script como Administrador."
}
if (-not (Test-Path $ExePath)) { throw "No se encuentra $ExePath" }

# 1. Abrir POIPIU al iniciar sesion y volver a abrirlo si se cae.
$action   = New-ScheduledTaskAction -Execute $ExePath -WorkingDirectory (Split-Path $ExePath)
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $env:USERNAME -RunLevel Limited -Force | Out-Null
Write-Host "Tarea '$TaskName' creada: POIPIU abrira al iniciar sesion."

# 2. La pantalla y el equipo nunca se apagan ni se suspenden (conectado a corriente).
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
Write-Host "Energia: sin apagado de pantalla ni suspension."

# 3. Sin protector de pantalla para este usuario.
Set-ItemProperty -Path "HKCU:\Control Panel\Desktop" -Name ScreenSaveActive -Value "0"
Write-Host "Protector de pantalla desactivado."

Write-Host ""
Write-Host "Listo. Datos de la maquina: $env:APPDATA\POIPIU  (tarjetas, rankings, reglas y la carpeta 'content')."
Write-Host "Reinicia el equipo para probar el arranque automatico."
