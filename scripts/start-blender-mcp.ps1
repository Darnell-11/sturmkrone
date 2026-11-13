# Startet Blender mit aktivem Blender-MCP-Addon und offenem Socket-Server (Port 9876).
# Der Server wird erst nach dem Start der Oberfläche geöffnet (Timer), sonst fehlt dem Operator der Kontext.
# Aufruf: powershell -File scripts/start-blender-mcp.ps1 [-Port 9876] [-Datei pfad\modell.blend]
param([int]$Port = 9876, [string]$Datei = '')
$exe = Get-ChildItem "$env:ProgramFiles\Blender Foundation\*\blender.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $exe) { Write-Error 'Blender nicht gefunden (winget install --id BlenderFoundation.Blender -e)'; exit 1 }
$py = @"
import bpy, addon_utils, traceback
addon_utils.enable('addon', default_set=True, persistent=True)
def go():
    try:
        bpy.context.scene.blendermcp_port = $Port
        bpy.ops.blendermcp.start_server()
    except Exception:
        traceback.print_exc()
    return None
bpy.app.timers.register(go, first_interval=3.0)
"@
$tmp = Join-Path $env:TEMP 'start-blender-mcp.py'
Set-Content $tmp $py
$args = @('--python', $tmp)
if ($Datei) { $args = @($Datei) + $args }
Start-Process -FilePath $exe.FullName -ArgumentList $args
Write-Host "Blender gestartet ($($exe.FullName)), Port $Port (Server öffnet nach etwa 5 Sekunden)"
