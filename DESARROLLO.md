# POIPIU — Desarrollo

Estado del código y decisiones técnicas. El diseño del producto está en `DISEÑO.md`.

## Cómo correrlo

```
npm install
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm test           # pruebas del motor, puntaje y replays
npm run typecheck
npm run build      # genera dist/
npm run e2e -- <mapa.osz> [skin.osk]   # prueba de humo en Chromium (autoplay de un mapa real)
```

Arrastra un `.osz` (mapa) y, si quieres, un `.osk` (skin) a la página. Con **JUGAR** juegas con mouse y `Z`/`X`; con **DEMO** juega el bot.

## Arquitectura

```
src/beatmap/   parser .osu, geometría y eventos de sliders, apilamiento (stacking)
src/engine/    GameEngine (juicios en tiempo real, ScoreV1), autoplay, runner de replays
src/scoring/   fórmulas de ScoreV1, puntaje máximo, tickets
src/content/   lector seguro de .osz/.osk, cargador de skins, skin neón por defecto
src/render/    PlayRenderer: dibuja el campo con las imágenes de la skin
src/audio/     AudioEngine: reloj de canción sobre el reloj de audio, hitsounds, preview
src/kiosk/     reglas del negocio: configuración, máquina de estados, tarjetas, ranking, almacenamiento
src/app/       PlayScene, KioskApp (controlador), pantallas, panel de operador, biblioteca de contenido
src/sim/       simulador de replays original (referencia para las pruebas)
```

Reglas de diseño:
- **El motor no conoce el DOM ni el audio.** Recibe muestras `(t, x, y, teclas)` y devuelve eventos. Por eso se prueba con replays reales y con un bot.
- **Un solo reloj.** El tiempo de canción sale de `AudioContext`; las entradas se convierten con `getOutputTimestamp()`.
- **Todo archivo de usuario es no confiable:** el lector de zips limita cantidad y tamaño, descarta rutas con `..` y solo conserva extensiones permitidas.

## Desviaciones del plan original

| Plan (`DISEÑO.md` §10) | Realidad | Motivo |
|---|---|---|
| PixiJS | Canvas 2D | Ya dibuja el campo completo a 1080p con las skins reales; PixiJS se puede cambiar después sin tocar el motor |
| Electron desde el inicio | App web primero | Se prueba entera en Chromium sin hardware; el empaquetado en Electron va al final |

## Validación del motor

- Alimentado con las tres replays reales, el motor da **exactamente** lo mismo que el simulador (juicios, combo y puntaje).
- Frente al juego real el simulador es exacto en una replay y se separa 2–3 objetos en otras dos (ver `DISEÑO.md` §5).
- Un autoplay perfecto alcanza exactamente el puntaje máximo calculado por fórmula.
- El spinner juzga por rotación con una regla tomada de lazer; **no está validado** contra puntajes reales.

## La máquina (`src/kiosk`)

`KioskMachine` es la lógica de negocio completa y **no tiene interfaz**: la pantalla solo llama sus métodos y dibuja su estado.

| Regla | Dónde |
|---|---|
| 1 depósito (moneda o tarjeta) = 3 jugadas; cada intento o cambio de mapa cuesta una | `insertCoin`, `scanCard`, `startPlay` |
| Tickets `round(100 × r²)`, solo con tarjeta; sin ella se pierden; mapas cortos no pagan | `finishPlay` |
| Ranking top 50 por mapa, nombre de hasta 8 caracteres, empate gana el más antiguo | `Leaderboards`, `submitName` |
| Premios: el más barato cuesta 3 000 tickets; el saldo vive en la tarjeta | `redeem`, `Cards` |
| Tutorial solo la primera vez por tarjeta; sesión inactiva se cierra sola | `finishTutorial`, `checkInactivity` |
| Todas las reglas se editan en el panel de operador y se validan | `mergeConfig`, `setConfig` |

Flujo de pantallas: `idle → credited → tutorial → skin → map → playing → results → name → ranking → map … → prizes → idle`.

El hardware está **simulado**: `C` = moneda, `T` = tarjeta (`Y` cambia de tarjeta, `Shift+T` crea una nueva), más botones en la barra inferior. Panel de operador: `Ctrl+Shift+O`.

## El kiosco (Electron)

```
npm run electron          # compila la web y abre la máquina a pantalla completa
npm run electron:dev      # ventana con herramientas de desarrollo (usa el servidor de Vite)
```

- `electron/main.mjs`: ventana en modo kiosco, una sola instancia, navegación y ventanas nuevas bloqueadas, música sin necesidad de clic, recarga automática si la página se cae. Se sale con **Ctrl+Shift+Q**.
- `electron/preload.cjs`: único puente hacia la página (`window.poipiuHost`). La página no tiene acceso a Node ni al sistema de archivos.
- `electron/store.mjs`: datos de la máquina (tarjetas, rankings, reglas) en archivos JSON con **escritura atómica** (archivo temporal + `fsync` + renombrar): un corte de luz deja el valor viejo o el nuevo, nunca uno a medias. Los mapas y skins viven en la carpeta `content/`.
- Los datos están en la carpeta de usuario de la aplicación (`%APPDATA%\POIPIU` en Windows, `~/.config/POIPIU` en Linux); `POIPIU_DATA_DIR` la cambia.
- Desviación del plan: archivos JSON en lugar de SQLite. Con un volumen de unas decenas de tarjetas y rankings no hace falta una base de datos, y evita un módulo nativo que compilar para cada máquina.
- Atajos como F5 no recargan la página de todos modos (la aplicación no tiene menú); el filtro de teclas queda como defensa adicional y **no se probó que sea necesario**.

## Pruebas

| Comando | Qué cubre |
|---|---|
| `npm test` | 80 pruebas: puntaje, parser, motor, equivalencia con replays reales, reglas del negocio |
| `npm run e2e -- mapa.osz skin.osk` | un mapa real con autoplay en Chromium |
| `xvfb-run -a node tools/e2e-electron.mjs mapa.osz` | el kiosco real: contenido, tarjeta, reglas y ranking sobreviven a un reinicio; salir con Ctrl+Shift+Q |
| `node tools/e2e-live.mjs mapa.osz` | tiempo real: un mouse real acierta círculos y el reloj de audio corre |
| `node tools/e2e-kiosk.mjs mapa.osz skin.osk` | la máquina completa: tarjeta, tutorial, skin, mapa, 3 partidas con el bot, nombre, ranking y canje |

## Hoja de ruta

| # | Hito | Estado |
|---|---|---|
| 1 | Parser, sliders, ScoreV1, replays | Hecho |
| 2 | Motor en tiempo real + autoplay + pruebas | Hecho |
| 3 | Carga de `.osz`/`.osk`, renderer con skins, audio, juego jugable | Hecho |
| 4 | Máquina: reposo, tarjeta/moneda simuladas, jugadas por depósito | Hecho |
| 5 | Flujo: tutorial, skin, mapa con preview, resultados | Hecho (tutorial es una demostración, no práctica interactiva) |
| 6 | Ranking top 50 con nombre, tickets en tarjeta, canje de premios | Hecho |
| 7 | Persistencia, modo operador, configuración | Hecho en web (localStorage + IndexedDB); falta SQLite para el kiosco |
| 8 | Kiosco en Electron: pantalla completa, datos en archivos, contenido en carpeta | Hecho (falta generar el instalador) |
| 8b | Barra de vida: se puede perder una partida (sin tickets ni ranking) | Hecho |
| 8c | Paquete para Windows | Portátil generado; instalador y scripts de kiosco **sin probar en Windows** (ver `docs/WINDOWS.md`) |
| 9 | Pulido: animaciones, sonidos de interfaz, spinner validado, rendimiento en la máquina | Pendiente |

## Límites conocidos

- El spinner usa una regla de lazer y no está validado contra puntajes reales.
- La barra de vida se calibró con tres replays (dos terminaron en fallo, una se completó). Los datos no fijan valores únicos: hay muchos conjuntos de parámetros que reproducen los mismos tres resultados, y el motor falla hasta 0,25 s después de que terminó la replay real. Conviene ajustarla jugando (`src/engine/health.ts`, `tools/hp-search.ts`).
- La vida solo cambia con el resultado de cada objeto; los ticks de slider no la afectan.
- La demostración de fondo y las vistas previas de skin se dibujan con el mismo renderer, pero la vista previa de audio solo funciona fuera del modo de pruebas.
