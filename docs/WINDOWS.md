# POIPIU en Windows

> **Estado:** el paquete para Windows se generó y se revisó su contenido, pero **nunca se ejecutó en Windows** (el entorno de desarrollo es Linux). El código del kiosco sí se probó en Electron real sobre Linux. Los scripts de PowerShell no se probaron. Haz una primera prueba en la máquina antes de dejarla en el local.

## Requisitos de la máquina
- Windows 10 u 11 de 64 bits.
- Pantalla horizontal 16:9 (se diseñó para 1920×1080; escala a otros tamaños).
- Mouse o trackball. Teclado solo para configurar (las teclas `Z`/`X` y los botones del mouse sirven para jugar).
- Salida de audio.

## Obtener el programa

**Opción A, en una PC con Windows (recomendada):** instalador completo, con icono y datos de versión.

```
git clone https://github.com/NandOwO/OSU-MACHINE
cd OSU-MACHINE
git checkout claude/magical-davinci-vkds44
npm install
npm run package:win          # genera release\POIPIU-Setup-0.1.0.exe y un .zip portátil
```

**Opción B, desde Linux o macOS:** solo versión portátil, porque el instalador necesita Wine.

```
npm install
npm run package:win:portable   # genera release/POIPIU-0.1.0-win-x64.zip
```

El `.zip` se descomprime donde quieras (por ejemplo `C:\POIPIU`) y se abre `POIPIU.exe`. Esta variante **no lleva el icono ni los datos de versión dentro del `.exe`**.

Ninguno de los dos está firmado: Windows SmartScreen mostrará una advertencia la primera vez ("Más información" → "Ejecutar de todas formas"). Para evitarla hace falta un certificado de firma de código.

## Dejarla como máquina de juego
1. Abre PowerShell **como Administrador** en la carpeta del proyecto.
2. `powershell -ExecutionPolicy Bypass -File scripts\windows\instalar-kiosco.ps1 -ExePath "C:\POIPIU\POIPIU.exe"`
   - Crea una tarea que abre POIPIU al iniciar sesión y lo reabre si se cierra.
   - Desactiva el apagado de pantalla, la suspensión y el protector de pantalla.
3. Para que arranque sola hasta el juego, activa el **inicio de sesión automático** (`netplwiz`, desmarcar "Los usuarios deben escribir su nombre y contraseña").
4. Recomendado: una cuenta de Windows solo para la máquina, sin permisos de administrador; desactivar notificaciones y las actualizaciones fuera del horario de atención.
5. `scripts\windows\desinstalar-kiosco.ps1` quita el arranque automático.

## Uso diario
| Acción | Cómo |
|---|---|
| Salir del programa | `Ctrl+Shift+Q` |
| Panel de operador (reglas, premios, mapas, tarjetas, rankings) | `Ctrl+Shift+O` |
| Agregar mapas y skins | Panel de operador → elegir `.osz` / `.osk`; o copiarlos a `%APPDATA%\POIPIU\content` con el programa cerrado |
| Datos de la máquina | `%APPDATA%\POIPIU\data` (un archivo JSON por tipo de dato) |
| Respaldo | copiar la carpeta `%APPDATA%\POIPIU` completa |
| Simulación de pago | Tecla `C` = moneda, `T` = tarjeta (`Y` cambia de tarjeta, `Shift+T` crea una nueva) |

## Lo que falta para una máquina real
- Conectar el lector de tarjetas y el aceptador de monedas: hoy son simulados con el teclado. La interfaz está en `src/app/hardware.ts`.
- Probar la latencia de audio y de entrada en el equipo final (hay un desfase de audio configurable pendiente en el panel de operador).
- Firmar el programa si se va a distribuir.

## Maps and skins of the factory

The repository does not contain maps or skins (they belong to their authors). To ship a cabinet with some preinstalled,
put the `.osz` / `.osk` files in a `bundled` folder before building (`npm run package:win`), or, on an already built copy,
in `resources\bundled\` next to `POIPIU.exe` (portable zip) or in the install folder (installer) **before the first start**.
They are copied once to `%APPDATA%\POIPIU\content`; anything the operator removes does not come back.
Any player can also import their own with the IMPORTAR button.

## Getting the build without a Windows machine

The workflow `.github/workflows/windows.yml` builds the installer and the portable zip on GitHub (Actions tab, run
"Windows build", download the `POIPIU-windows` artifact).
