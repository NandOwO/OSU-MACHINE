# Beat Arcade — Diseño v0

Réplica del modo **osu!standard** (el de cursor, no mania ni taiko) con temática de máquina arcade. Se juega con dinero (monedas) o tarjeta, y los mapas se leen desde archivos `.osz`.

> **Nombre de trabajo:** "Beat Arcade". "osu!" es marca registrada de ppy, así que el proyecto no debe llamarse así ni usar su logo.

---

## 0. Decisiones tomadas por defecto (confirmar o cambiar)

| Tema | Propuesta v0 | Motivo |
|---|---|---|
| Jugadas por depósito | **3 jugadas** (1 jugada + 2 reintentos) | Un depósito alcanza para varios intentos sin regalar partidas |
| Tickets por partida | `floor(puntaje / 10 000)`, tope **20 por partida** | Recompensa escalonada, se ve en la pantalla de resultados |
| Tickets por escaneo de tarjeta | Se reclama **todo el saldo pendiente** de tickets, mínimo 1 | Un solo gesto para reclamar; la tarjeta guarda el saldo |
| Nombre en ranking | **3 caracteres** estilo arcade (`AAA`–`ZZZ`, `0-9`) | Es el formato clásico; se cambia en config si lo quieren más largo |
| Ranking | **Top 50** por mapa, persistente en el kiosco | Requisito tuyo |
| Puntaje | 300=300, 100=100, 50=50, multiplicado por combo (ver §5) | Simple para v1 |
| Input | Mouse/trackball como cursor; **Z / X** como alternativa | Cursor real con la mecánica de osu!standard |
| Plataforma | **App de escritorio en pantalla completa (Electron)** | Acceso a hardware (monedas, tarjeta, tickets) desde Node |

---

## 1. Alcance

**Dentro de v1**
- Leer `.osz` (mapas y skins) con `.osu` en modo osu!standard.
- Atract mode con video promocional, tutorial corto, selección de skin, selección de mapa con preview, jugar, resultados, ranking.
- Créditos por moneda o tarjeta, reintentos por depósito, tickets al escanear tarjeta.
- Animaciones de transición, judgements, ranking.

**Fuera de v1**
- Multijugador, online, descarga de mapas desde osu! web.
- Modos mania, taiko, catch.
- Edición de mapas.
- Sliders y spinners completos: se implementan en v2 (en v1 solo círculos, o sliders como círculos).

---

## 2. Flujo del jugador (máquina de estados del kiosco)

```
IDLE (attract: video promo, "INSERT COIN / TAP CARD" parpadea)
  │ moneda o tarjeta detectada
  ▼
CREDITED (+1 crédito = 3 jugadas, animación de contador)
  │ aceptar
  ▼
TUTORIAL (opcional, se omite con botón, ~30 s)
  ▼
SKIN_SELECT  ──►  MAP_SELECT (carrusel + preview de audio)
                       │ elegir mapa
                       ▼
                    PLAYING (countdown 3-2-1, mapa)
                       ▼
                    RESULTS (puntaje, tickets ganados)
                       │
          ┌────────────┴─────────────┐
   ¿top 50?                    no top 50
          │                          │
   NAME_ENTRY (animación)       ¿jugadas restantes?
          │                     ├─ sí → MAP_SELECT
          ▼                     └─ no → IDLE
     LEADERBOARD ──► (mismo chequeo)
```

Reglas del flujo:
- La **skin** se elige una vez por sesión de créditos; se puede cambiar al volver a `SKIN_SELECT` desde `MAP_SELECT` (botón).
- El **tutorial** se ofrece solo la primera vez por sesión, o siempre si el jugador lo pide.
- Si se acaban las jugadas durante `RESULTS` y el jugador **no** está en el top 50, vuelve a `IDLE`.
- Si el puntaje entra al top 50, se pasa a `NAME_ENTRY` aunque no queden jugadas.

---

## 3. Prototipo: pantallas

Wireframes en texto para fijar la disposición. Resolución de diseño: **1920×1080**, escalable.

### 3.1 Attract (IDLE)
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│        [ video promocional en loop, 30-45 s ]            │
│                                                          │
│                   ▌ BEAT ARCADE ▐                        │
│                                                          │
│              >>> INSERT COIN / TAP CARD <<<              │
│                                                          │
│   CRÉDITOS: 0          TOP: AAA 982 340                  │
└──────────────────────────────────────────────────────────┘
```

### 3.2 Tutorial (3 pasos, ~30 s)
```
┌──────────────────────────────────────────────────────────┐
│  PASO 1/3 — Los círculos aparecen                        │
│   (●)   ← animación: círculo se encoge hasta el aro      │
│  Haz clic cuando el aro toque el círculo.                │
│                                    [ SALTAR ▶ ]          │
│  ● ○ ○     progreso                                      │
└──────────────────────────────────────────────────────────┘
```
Pasos: (1) timing con aro, (2) cursor y combo, (3) judgements y puntaje. Termina con un círculo de práctica en un mapa de 10 s.

### 3.3 Selección de skin
```
┌──────────────────────────────────────────────────────────┐
│             ELIGE TU SKIN                                │
│   [ ◀ ]   ┌──────────┐   [ ▶ ]                           │
│           │ preview  │                                   │
│           │ círculos │   Default · Neon · Mi skin.osz    │
│           └──────────┘                                   │
│                                  [ CONFIRMAR ]           │
└──────────────────────────────────────────────────────────┘
```

### 3.4 Selección de mapa (con preview)
```
┌──────────────────────────────────────────────────────────┐
│  ◀  [ portada ]  ██ MAP A ██  [ portada ]  ▶   JUGADAS: 3│
│                  Artista — Título                         │
│                  ★ dificultad   ♪ preview 15 s            │
│   ♪ ───────────────●─────────── (waveform del preview)   │
│                                    [ JUGAR ]             │
└──────────────────────────────────────────────────────────┘
```
Al enfocar un mapa, suena su preview (`PreviewTime` del `.osu`) durante 15 s con fade-in/out. Al cambiar de mapa, el audio cruza en 300 ms.

### 3.5 Juego (HUD)
```
┌──────────────────────────────────────────────────────────┐
│ SCORE 012 340              COMBO x42        ACC 97.8%    │
│                                                          │
│            ◯  ●   ◯                                       │
│                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (barra progreso)│
│  JUGADA 2/3                                              │
└──────────────────────────────────────────────────────────┘
```

### 3.6 Resultados y tickets
```
┌──────────────────────────────────────────────────────────┐
│                    ¡COMPLETADO!                          │
│     300: 812   100: 41   50: 4   MISS: 3                 │
│     Puntaje 487 220        Máx combo 143                 │
│     TICKETS GANADOS: 20                                  │
│                                                          │
│     [ REINTENTAR (2 restantes) ]   [ CAMBIAR MAPA ]      │
└──────────────────────────────────────────────────────────┘
```

### 3.7 Ingreso de nombre (top 50)
```
┌──────────────────────────────────────────────────────────┐
│        ★ NUEVO RÉCORD — puesto #17 ★                     │
│                                                          │
│    #15  KAT  510 000   ←  se desliza hacia abajo         │
│    #16  ZZZ  490 000                                     │
│    #17  [A][B][_]  487 220  ← nombre, letra por letra    │
│    #18  ...                                              │
│                                                          │
│   ▲ ▼ cambia letra   ◀ ▶ mueve   ENTER confirma           │
└──────────────────────────────────────────────────────────┘
```
La animación: la fila nueva aparece en la posición de inserción, las filas inferiores bajan 1 lugar (≈400 ms), el cursor parpadea sobre la primera celda, el jugador elige letra con la moneda o el trackball y confirma.

---

## 4. Reglas de negocio (todo en `config.json`)

```json
{
  "credits": {
    "coinValue": 1,
    "creditsPerDeposit": 1,
    "playsPerCredit": 3
  },
  "tickets": {
    "perScorePoints": 10000,
    "maxPerPlay": 20,
    "claimOnCardScan": "all",
    "minClaim": 1
  },
  "leaderboard": {
    "size": 50,
    "nameLength": 3,
    "nameCharset": "A-Z0-9"
  },
  "tutorial": { "enabledFirstSession": true, "skippable": true }
}
```

- **Jugadas**: `playsPerCredit` define cuántas partidas da un depósito. Cada jugada consume una; los reintentos son jugadas nuevas del mismo crédito.
- **Tickets**: se calculan al terminar la partida y van a un saldo en la base de datos. Al escanear la tarjeta se reclama el saldo. Si la tarjeta no está registrada, se reclama solo a nivel de kiosco (ver §10, decisiones abiertas).

---

## 5. Gameplay (osu!standard, v1)

Fórmulas tomadas del formato y de la especificación de osu!standard. Playfield 512×384.

| Concepto | Fórmula | Nota |
|---|---|---|
| Radio del círculo (px) | `R = 54.4 − 4.48 × CS` | CS viene de `[Difficulty]` |
| Tiempo de aparición (ms) | AR<5: `1200 + 600×(5−AR)/5`; AR=5: `1200`; AR>5: `1200 − 750×(AR−5)/5` | AR de `[Difficulty]` |
| Ventana 300 (ms) | `80 − 6 × OD` | OD = OverallDifficulty |
| Ventana 100 (ms) | `140 − 8 × OD` | |
| Ventana 50 (ms) | `200 − 10 × OD` | |
| Fuera de ventana | MISS | |
| Puntaje | `(300×3 + 100×1 + 50×0,5)...` → v1: `juicio × combo_multiplicador`, donde multiplicador = `min(1 + combo/10, 8)` | Simple y explicable en pantalla |
| Precisión | `(300·3 + 100·1 + 50·0,5) / (3 × total)` | Como en osu! |

Reglas de entrada:
- Un clic o tecla (Z/X) cuenta como un golpe. Se usa el **golpe más cercano** en el tiempo dentro de la ventana.
- Un clic sin círculo cercano no cuenta como miss, pero se puede limitar por config.

Timing: el motor usa el **reloj de audio** (`AudioContext.currentTime`), no `requestAnimationFrame`, para que los juicios no dependan de la tasa de refresco.

---

## 6. Contenido `.osz` y skins

Un `.osz` es un ZIP. Puede tener cualquiera de estos contenidos, o los dos:

| Contenido | Archivos | Cómo se detecta |
|---|---|---|
| **Mapa** | `*.osu`, audio (`AudioFilename`), fondo, `.osb` opcional | Existe al menos un `.osu` |
| **Skin** | `skin.ini`, imágenes (`hitcircle.png`, `hitcircleoverlay.png`, `cursor.png`, `approachcircle.png`, `hit300.png`…), `sounds` opcional | Existe `skin.ini` |

Reglas:
- El importador indexa el `.osz` al arrancar o al insertarlo en la carpeta `content/`. Un archivo puede aportar mapas, skin o ambos.
- En `SKIN_SELECT` aparecen todas las skins encontradas (la default + las importadas).
- Parseo de `.osu`: secciones `[General]` (`AudioFilename`, `PreviewTime`), `[Metadata]`, `[Difficulty]`, `[TimingPoints]`, `[HitObjects]`. Campos con `key: value`, objetos separados por coma.
- Los mapas con formato o modo distinto a `Mode: 0` se marcan como no soportados y no aparecen en la selección.
- Los archivos externos se validan: tamaño máximo, sin rutas con `..`, extensiones permitidas.

---

## 7. Paleta de colores y tipografía

Tema arcade oscuro con neón. Todo va como tokens en `:root` para poder cambiar la skin de UI.

| Token | Hex | Uso |
|---|---|---|
| `--bg-0` | `#07061A` | Fondo principal |
| `--bg-1` | `#12102E` | Paneles |
| `--bg-2` | `#1E1A45` | Bordes, tarjetas |
| `--neon-pink` | `#FF2E88` | Acento principal, botones |
| `--neon-cyan` | `#00E5FF` | Círculos, selección, HUD |
| `--neon-yellow` | `#FFD23F` | Créditos, tickets, récord |
| `--neon-lime` | `#7CFF4F` | 300 / éxito |
| `--judge-100` | `#4FC3F7` | Juicio 100 |
| `--judge-50` | `#FFB74D` | Juicio 50 |
| `--judge-miss` | `#FF3B3B` | Miss |
| `--text` | `#F5F5FF` | Texto principal |
| `--text-dim` | `#8C88B8` | Texto secundario |

- Contraste de `--text` sobre `--bg-0`: > 15:1. Los textos de `--text-dim` solo para información secundaria.
- Tipografía: **Press Start 2P** (títulos, créditos, nombres del ranking) y **Inter** o **Rajdhani** para textos de lectura. Ambas gratuitas en Google Fonts.
- Modo oscuro es el único en v1; la pantalla del kiosco no tiene modo claro.

---

## 8. Animaciones

| Momento | Animación |
|---|---|
| Attract | "INSERT COIN" parpadea a 1 Hz; el video promo hace loop |
| Moneda / tarjeta | Destello, sonido de moneda, contador de créditos sube con "tick" |
| Inicio de partida | Cuenta regresiva 3-2-1 con escala y fade |
| Círculos | Aparecen con fade-in; el aro (approach) se encoge hasta el tamaño exacto |
| Juicios | Texto `300`/`100`/`50`/`MISS` sube y desaparece en 400 ms |
| Combo | Número pulsa al subir; al romper combo, se apaga |
| Resultados | Conteo de puntaje rápido, tickets vuelan hacia el contador |
| Ranking | Filas inferiores se deslizan 400 ms; la nueva entra con rebote |
| Nombre | Letra activa parpadea; letras cambian con efecto de "rueda" |
| Transiciones | Fade a negro corto entre pantallas; wipe horizontal para mapas |

Implementación: **GSAP** para UI (pantallas, ranking, contadores) y tweens de **PixiJS** para el juego. Nada de animar el juego con CSS.

---

## 9. Arquitectura

```
┌──────────────────────────── Electron (kiosk) ────────────────────────────┐
│                                                                          │
│  MAIN PROCESS (Node)                    RENDERER (UI + juego)            │
│  ┌──────────────────────────┐          ┌────────────────────────────┐    │
│  │ HardwareAdapter          │  IPC     │ KioskStateMachine (UI)     │    │
│  │  ├ CoinAcceptor          │◄────────►│  ├ AttractScreen           │    │
│  │  ├ CardReader            │          │  ├ TutorialScreen          │    │
│  │  └ TicketDispenser       │          │  ├ SkinSelectScreen        │    │
│  │ CreditService            │          │  ├ MapSelectScreen         │    │
│  │ TicketService            │          │  ├ GameScreen              │    │
│  │ LeaderboardService       │          │  ├ ResultsScreen           │    │
│  │ ContentLibrary (.osz)    │          │  └ NameEntryScreen         │    │
│  │ Storage (SQLite)         │          │                            │    │
│  └──────────────────────────┘          │ GameEngine (sin DOM)       │    │
│                                        │  ├ BeatmapParser (.osu)    │    │
│                                        │  ├ HitObjectScheduler      │    │
│                                        │  ├ JudgementEngine         │    │
│                                        │  ├ ScoreCalculator         │    │
│                                        │  └ AudioClock              │    │
│                                        │ Renderer (PixiJS) + Skin   │    │
│                                        └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

Puntos clave:
- **Hardware detrás de una interfaz.** `CoinAcceptor`, `CardReader` y `TicketDispenser` son interfaces. Hay una implementación real y una `Simulated` para desarrollar con teclado (moneda = tecla `C`, tarjeta = `T`, ticket = log).
- **El motor del juego no depende del DOM ni de Electron.** Así se puede probar con Vitest y reutilizar en otra plataforma.
- **La lógica de créditos, tickets y ranking vive en el main process**, no en la UI. El renderer solo pide acciones por IPC. Así un refresco o error de UI no regala créditos.
- **Persistencia local en SQLite.** El kiosco debe funcionar sin internet. Tablas: `credits`, `plays`, `tickets`, `cards`, `scores` (top 50 por mapa), `skins_selected`.
- **Transacciones**: depósito + jugadas + tickets se escriben en una transacción, para no perder crédito si se corta la luz.

Flujo de una moneda:
`CoinAcceptor (pulso)` → `main: CreditService.add(1)` → `IPC: credits.changed` → `UI: animación + tick`.

---

## 10. Stack tecnológico

| Capa | Elección | Por qué |
|---|---|---|
| Shell de escritorio | **Electron** | Pantalla completa, acceso a hardware desde Node, empaquetado para Windows/Linux |
| Lenguaje | **TypeScript** (estricto) | Parseo de formatos y reglas de puntaje son fáciles de equivocar |
| Build UI | **Vite** | Rápido, HMR en desarrollo |
| Render del juego | **PixiJS v8** | 2D por WebGL, miles de sprites, tweens nativos |
| Animación UI | **GSAP** | Timelines para ranking, transiciones y contadores |
| Audio | **Web Audio API** (con `AudioBuffer`) | Latencia baja y reloj preciso para el timing |
| Descompresión `.osz` | **fflate** | ZIP en JS, sin dependencias nativas |
| Persistencia | **better-sqlite3** (en main) | Síncrono, transaccional, un archivo |
| Hardware | **serialport** (monedas, tickets), **node-hid** o lector USB en modo teclado (tarjeta) | Ver §11 |
| Tests | **Vitest** (lógica), **Playwright** (flujo de pantallas) | Playwright ya está en el entorno |
| Empaquetado | **electron-builder** | Instalador para la máquina |

Alternativa descartada: **Unity/Godot**. Son buenos para juegos, pero la carga de `.osz` y la UI tipo web son más directas en TS. Si el rendimiento en la máquina resulta insuficiente, se puede migrar solo el motor de juego.

---

## 11. Hardware (pendiente de decisión)

Se necesita saber qué modelo de hardware tienen:

| Componente | Opciones típicas | Integración |
|---|---|---|
| Aceptador de monedas | Pulsos (1 pulso = 1 moneda), o protocolo MDB/serie | `serialport` o GPIO |
| Lector de tarjeta | RFID MIFARE (UID por USB HID), banda magnética | Modo teclado (USB HID) o serie |
| Dispensador de tickets | Motor con sensor, por pulso o serie | `serialport` |
| Entrada de juego | Trackball o mouse, botones Z/X | Mouse estándar |

Para la tarjeta: lo más simple es **RFID con UID**. El UID es el ID de la tarjeta; el saldo de tickets vive en la base de datos local asociado a ese UID.

---

## 12. Plan de prototipo (orden de trabajo)

1. **Parser `.osu` + tests** (sin UI): leer un mapa real y listar los `HitObjects`.
2. **Importador `.osz`** con fflate: indexar mapas y skins.
3. **Motor de juego** en consola: scheduler, juicios y puntaje, con reloj simulado.
4. **Renderer PixiJS**: círculos, aro de approach, HUD, juicios. Skin default.
5. **Pantallas**: attract → selección de mapa con preview → juego → resultados.
6. **Créditos y jugadas** con `SimulatedCoinAcceptor` (teclado).
7. **Ranking top 50** con animación de inserción y nombre.
8. **Tutorial, video promo, skin selection** y animaciones pulidas.
9. **Hardware real** y pruebas de latencia en la máquina.

Criterio de aceptación del prototipo: un `.osz` real se carga, suena el preview, el mapa se juega con juicios correctos y el puntaje entra al ranking con animación.

---

## 13. Decisiones abiertas

1. ¿Confirman los valores de §0 (jugadas por depósito, tickets por partida, 3 caracteres)?
2. ¿Qué hardware exacto tienen (§11)? Define la integración real.
3. ¿El ticket se reclama con tarjeta registrada (saldo por UID) o solo al momento del escaneo (sin saldo acumulado)?
4. ¿Hay normativa local sobre premios con tickets o juegos con dinero? Puede obligar a cambiar la regla de tickets.
5. ¿El video promocional lo graban o lo hacemos con los mapas y el arte del proyecto?
6. ¿Nombre definitivo del proyecto (no puede ser "osu!")?
