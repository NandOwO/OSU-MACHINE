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
src/app/       PlayScene (une todo) y la aplicación web
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

## Hoja de ruta

| # | Hito | Estado |
|---|---|---|
| 1 | Parser, sliders, ScoreV1, replays | Hecho |
| 2 | Motor en tiempo real + autoplay + pruebas | Hecho |
| 3 | Carga de `.osz`/`.osk`, renderer con skins, audio, juego jugable | Hecho |
| 4 | Máquina: reposo, tarjeta/moneda simuladas, jugadas por depósito | Pendiente |
| 5 | Flujo: tutorial, skin, mapa con preview, resultados | Pendiente |
| 6 | Ranking top 50 con nombre, tickets en tarjeta, canje de premios | Pendiente |
| 7 | Persistencia, modo operador, configuración | Pendiente |
| 8 | Empaquetado en Electron, kiosco a pantalla completa | Pendiente |
