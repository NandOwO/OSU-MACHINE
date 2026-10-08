<# Quita el arranque automatico de POIPIU. No borra los datos de la maquina. #>
param([string]$TaskName = "POIPIU Kiosco")
$ErrorActionPreference = "Stop"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Tarea '$TaskName' eliminada."
} else {
  Write-Host "No existe la tarea '$TaskName'."
}
