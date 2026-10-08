# POiSU — Diseño v0.1

Réplica del modo **osu!standard** (el de cursor, no mania ni taiko) con temática de máquina arcade. Se juega con monedas o tarjeta, y los mapas se leen desde archivos `.osz`.

> **Proyecto educativo.** Cobros, tickets y premios son **simulados** (con animación), no hay dinero ni premios reales. Si algún día se usaran de verdad, habría que revisar la normativa local antes.

---

## 0. Decisiones confirmadas y valores por defecto

| Tema | Decisión | Detalle |
|---|---|---|
| Jugadas por depósito | **3 jugadas por depósito** | Cada jugada puede ser un reintento o un cambio de mapa |
| Tickets por partida | **Configurable** | Fórmula y tope en `config.json` (ver §4) |
| Nombre en ranking | **Hasta 8 caracteres** | Configurable; por defecto se pide el máximo |
| Puntaje | **Lo más cercano posible a osu! (ScoreV1)** | Ver §5 |
| Hardware | **Simulado** | Monedas, tarjeta y tickets con simulador y animaciones (ver §11) |
| Tickets | **Se acreditan a la tarjeta registrada (UID)** | Saldo persistente por tarjeta |
| Video promocional | **Hecho con los mapas y el arte del proyecto** | Sin grabación externa |
| Nombre del proyecto | **POiSU** | Ver nota de nombre en §13 |
| Ranking | **Top 50** por mapa, persistente en el kiosco | |
| Input | Mouse/trackball como cursor; **Z / X** como alternativa | Mecánica de cursor de osu!standard |
| Plataforma | **App de escritorio en pantalla completa (Electron)** | |

---

## 1. Alcance

**Dentro de v1**
- Leer `.osz` (mapas y skins) con `.osu` en modo osu!standard.
- Attract mode con video promocional, tutorial corto, selección de skin, selección de mapa con preview, jugar, resultados, ranking.
- Créditos simulados por moneda o tarjeta, jugadas por depósito, tickets acreditados a la tarjeta.
- Animaciones de transición, juicios, ranking, dispensado de tickets (simulado).

**Fuera de v1**
- Hardware real, multijugador, online, descarga de mapas desde osu! web.
- Modos mania, taiko, catch. Edición de mapas.
- Sliders y spinners completos: en v1 solo círculos (los sliders se tratan como círculos).

---

## 2. Flujo del jugador (máquina de estados del kiosco)

```
IDLE (attract: video promo, "INSERT COIN / TAP CARD" parpadea)
  │ moneda (simulada) o tarjeta (simulada)
  ▼
CREDITED (+1 depósito = 3 jugadas, animación de contador)
  │ tarjeta: se registra el UID si es nuevo y se muestra su saldo de tickets
  ▼
TUTORIAL (opcional, se omite con botón, ~30 s; solo primera sesión)
  ▼
SKIN_SELECT  ──►  MAP_SELECT (carrusel + preview de audio)
                       │ elegir mapa
                       ▼
                    PLAYING (countdown 3-2-1)
                       ▼
                    RESULTS (puntaje, tickets ganados)
                       │
          ┌────────────┴─────────────┐
   ¿top 50?                    no top 50
          │                          │
   NAME_ENTRY (animación)       ¿jugadas restantes?
          │                     ├─ sí → MAP_SELECT
          ▼                     └─ no → IDLE (tickets quedan en la tarjeta)
     LEADERBOARD ──► (mismo chequeo)
```

Reglas del flujo:
- La **skin** se elige al empezar la sesión; se puede cambiar desde `MAP_SELECT` con un botón.
- El **tutorial** se ofrece solo en la primera sesión, o si el jugador lo pide.
- Un **cambio de mapa** consume una jugada igual que un reintento. Así el jugador no gasta más por cambiar.
- Si el puntaje entra al top 50, se pasa a `NAME_ENTRY` aunque no queden jugadas.
- Los tickets se acreditan a la tarjeta del jugador. Si no pasó tarjeta (pagó con moneda), los tickets se pierden salvo que la tarjeta se pase antes de terminar la sesión; ver §13.

---

## 3. Prototipo: pantallas

Wireframes en texto para fijar la disposición. Resolución de diseño: **1920×1080**, escalable.

### 3.1 Attract (IDLE)
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│        [ video promocional en loop, 30-45 s ]            │
│                                                          │
│                     ▌ POiSU ▐                            │
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
Pasos: (1) timing con aro, (2) cursor y combo, (3) juicios y puntaje. Termina con un círculo de práctica en un mapa de 10 s.

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
Al enfocar un mapa suena su preview (`PreviewTime` del `.osu`) durante 15 s con fade-in/out. Al cambiar de mapa, el audio cruza en 300 ms.

### 3.5 Juego (HUD)
```
┌──────────────────────────────────────────────────────────┐
│ SCORE 012 340              COMBO x42        ACC 97.8%    │
│                                                          │
│            ◯  ●   ◯                                      │
│                                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  (progreso)    │
│  JUGADA 2/3                                              │
└──────────────────────────────────────────────────────────┘
```

### 3.6 Resultados y tickets
```
┌──────────────────────────────────────────────────────────┐
│                    ¡COMPLETADO!                          │
│     300: 812   100: 41   50: 4   MISS: 3                 │
│     Puntaje 487 220        Máx combo 143                 │
│     TICKETS GANADOS: 194  → tarjeta UID …A3F2            │
│                                                          │
│     [ REINTENTAR (2 restantes) ]   [ CAMBIAR MAPA ]      │
└──────────────────────────────────────────────────────────┘
```
Con tarjeta registrada, al terminar la partida los tickets vuelan al contador de la tarjeta. Al pasar la tarjeta de nuevo en `IDLE`, se muestra el saldo y se **reclama** (animación de dispensado simulado).

### 3.7 Ingreso de nombre (top 50)
```
┌──────────────────────────────────────────────────────────┐
│        ★ NUEVO RÉCORD — puesto #17 ★                     │
│                                                          │
│    #15  KATRINA      510 000                             │
│    #16  ZZZ          490 000                             │
│    #17  [A][B][_]    487 220  ← nombre, letra por letra  │
│    #18  ...                                              │
│                                                          │
│   ▲ ▼ cambia letra   ◀ ▶ mueve   ENTER confirma           │
└──────────────────────────────────────────────────────────┘
```
La animación: la fila nueva aparece en la posición de inserción, las filas inferiores bajan 1 lugar (≈400 ms), el cursor parpadea sobre la primera celda. El nombre admite hasta **8 caracteres**; se escribe con ▲ ▼ o con Z/X y se confirma con ENTER. Charset: `A-Z`, `0-9`, espacio, `_` y `-`.

---

## 4. Reglas de negocio (todo en `config.json`)

```json
{
  "credits": {
    "coinValue": 1,
    "cardGivesDeposit": true,
    "playsPerDeposit": 3,
    "countMapChangeAsPlay": true
  },
  "tickets": {
    "perScorePoints": 2500,
    "maxPerPlay": 1000,
    "cardRequired": true,
    "claimMode": "all"
  },
  "prizes": [
    { "name": "Llavero", "cost": 500 },
    { "name": "Peluche chico", "cost": 1500 },
    { "name": "Funko Pop", "cost": 3000 }
  ],
  "leaderboard": {
    "size": 50,
    "nameMaxLength": 8,
    "nameCharset": "A-Z0-9 _-"
  },
  "tutorial": { "enabledFirstSession": true, "skippable": true }
}
```

Cálculo de tickets por partida: `min(floor(puntaje / perScorePoints), maxPerPlay)`.

Con estos valores, una partida de ~1 000 000 de puntaje da 400 tickets. El Funko (3 000) necesita unas 8 partidas muy buenas, y el premio más barato (500) se gana con una partida decente. **Estos números son una propuesta a ajustar al ver jugar a alguien**: `perScorePoints` y `prizes` son la palanca.

- **Jugadas**: `playsPerDeposit` define cuántas partidas da un depósito. Cada partida (incluido un cambio de mapa o reintento) consume una.
- **Tickets**: se calculan al terminar la partida y se acreditan al **saldo de la tarjeta registrada** (UID). Sin tarjeta, la partida da puntaje pero no tickets.
- **Reclamar**: pasar la tarjeta en `IDLE` reclama el saldo completo (`claimMode: "all"`) con animación de dispensado simulado. El saldo queda persistido en SQLite.

---

## 5. Puntaje y precisión (lo más cercano a osu!)

Objetivo: replicar **ScoreV1** (el sistema clásico de osu!standard), no el ScoreV2 de lazer.

**Juicios y valores base**

| Juicio | Valor base |
|---|---|
| 300 | 300 |
| 100 | 100 |
| 50 | 50 |
| MISS | 0 |

**Puntaje por golpe (ScoreV1):**
`puntos = valor + valor × (combo_previo × multiplicador_dificultad) / 25`

- `combo_previo` es el combo antes de este golpe.
- `multiplicador_dificultad` depende de HP, CS y OD del mapa (tabla de la wiki de osu!). Sin mods.
- Los **valores exactos de esa tabla** se toman de la wiki de osu! al implementar. Antes de programarlo, hay que confirmarlos ahí, porque no quiero inventarlos.

**Precisión (como en osu!):**
`ACC = (300·300 + 100·100 + 50·50) / (300 · total_objetos)`, expresada como porcentaje. Equivale a `(n300·3 + n100·1 + n50·0,5) / (3 · total)`.

**Juicios (ventanas en ms, con OD del mapa):**

| Juicio | Ventana |
|---|---|
| 300 | `80 − 6 × OD` |
| 100 | `140 − 8 × OD` |
| 50 | `200 − 10 × OD` |
| MISS | fuera de la ventana de 50, o aro que pasa sin golpe |

**Geometría (playfield 512×384):**
- Radio: `R = 54.4 − 4.48 × CS`.
- Tiempo de aparición: AR<5 → `1200 + 600×(5−AR)/5`; AR=5 → `1200`; AR>5 → `1200 − 750×(AR−5)/5`.

**Entrada:** cada clic o tecla (Z/X) es un golpe. Se asigna al círculo más cercano en tiempo dentro de la ventana.

**Reloj:** el motor usa el reloj de audio (`AudioContext.currentTime`), no `requestAnimationFrame`, para que los juicios no dependan de la tasa de refresco.

---

## 6. Contenido `.osz` y skins

Un `.osz` es un ZIP. Puede tener mapa, skin, o los dos:

| Contenido | Archivos | Cómo se detecta |
|---|---|---|
| **Mapa** | `*.osu`, audio (`AudioFilename`), fondo, `.osb` opcional | Existe al menos un `.osu` |
| **Skin** | `skin.ini`, imágenes (`hitcircle.png`, `hitcircleoverlay.png`, `cursor.png`, `approachcircle.png`, `hit300.png`…), `sounds` opcional | Existe `skin.ini` |

Reglas:
- El importador indexa los `.osz` de la carpeta `content/` al arrancar, y al insertar uno nuevo.
- En `SKIN_SELECT` aparecen la skin default y todas las importadas.
- Parseo de `.osu`: `[General]` (`AudioFilename`, `PreviewTime`), `[Metadata]`, `[Difficulty]` (CS, AR, OD, HP), `[TimingPoints]`, `[HitObjects]`.
- Mapas con `Mode` distinto de `0` no se muestran.
- Validación de archivos externos: tamaño máximo, sin rutas con `..`, extensiones permitidas.

---

## 7. Paleta de colores y tipografía

Tema arcade oscuro con neón. Todo va como tokens en `:root`.

| Token | Hex | Uso |
|---|---|---|
| `--bg-0` | `#07061A` | Fondo principal |
| `--bg-1` | `#12102E` | Paneles |
| `--bg-2` | `#1E1A45` | Bordes, tarjetas |
| `--neon-pink` | `#FF2E88` | Acento principal, botones |
| `--neon-cyan` | `#00E5FF` | Círculos, selección, HUD |
| `--neon-yellow` | `#FFD23F` | Créditos, tickets, récord |
| `--neon-lime` | `#7CFF4F` | Juicio 300, éxito |
| `--judge-100` | `#4FC3F7` | Juicio 100 |
| `--judge-50` | `#FFB74D` | Juicio 50 |
| `--judge-miss` | `#FF3B3B` | Miss |
| `--text` | `#F5F5FF` | Texto principal |
| `--text-dim` | `#8C88B8` | Texto secundario |

- Contraste de `--text` sobre `--bg-0`: > 15:1. `--text-dim` solo para información secundaria.
- Tipografía: **Press Start 2P** (títulos, créditos, nombres del ranking) e **Inter** o **Rajdhani** para lectura. Ambas gratuitas en Google Fonts.
- Solo modo oscuro: la pantalla del kiosco no tiene modo claro.

---

## 8. Animaciones

| Momento | Animación |
|---|---|
| Attract | "INSERT COIN" parpadea a 1 Hz; el video promo hace loop |
| Moneda simulada | Moneda que cae por una ranura en pantalla, destello, contador sube con "tick" |
| Tarjeta simulada | Tarjeta que se desliza sobre un lector, aparece el UID y el saldo |
| Inicio de partida | Cuenta regresiva 3-2-1 con escala y fade |
| Círculos | Fade-in; el aro (approach) se encoge hasta el tamaño exacto |
| Juicios | `300`/`100`/`50`/`MISS` sube y se desvanece en 400 ms |
| Combo | Número pulsa al subir; al romper combo, se apaga |
| Resultados | Conteo rápido de puntaje; tickets vuelan hacia el saldo de la tarjeta |
| Dispensado de tickets | Tiras de tickets que salen por una ranura simulada, con sonido |
| Ranking | Filas inferiores se deslizan 400 ms; la nueva entra con rebote |
| Nombre | Letra activa parpadea; letras cambian con efecto de "rueda" |
| Transiciones | Fade a negro corto entre pantallas; wipe horizontal para mapas |

Implementación: **GSAP** para UI (pantallas, ranking, contadores, dispensado) y tweens de **PixiJS** para el juego. Nada de animar el juego con CSS.

---

## 9. Arquitectura

```
┌──────────────────────────── Electron (kiosk) ────────────────────────────┐
│                                                                          │
│  MAIN PROCESS (Node)                    RENDERER (UI + juego)            │
│  ┌──────────────────────────┐          ┌────────────────────────────┐    │
│  │ Hardware (simulado)      │  IPC     │ KioskStateMachine (UI)     │    │
│  │  ├ CoinAcceptor          │◄────────►│  ├ AttractScreen           │    │
│  │  ├ CardReader            │          │  ├ TutorialScreen          │    │
│  │  └ TicketDispenser       │          │  ├ SkinSelectScreen        │    │
│  │ CreditService            │          │  ├ MapSelectScreen         │    │
│  │ TicketService (por UID)  │          │  ├ GameScreen              │    │
│  │ LeaderboardService       │          │  ├ ResultsScreen           │    │
│  │ ContentLibrary (.osz)    │          │  └ NameEntryScreen         │    │
│  │ Storage (SQLite)         │          │                            │    │
│  └──────────────────────────┘          │ GameEngine (sin DOM)       │    │
│                                        │  ├ BeatmapParser (.osu)    │    │
│                                        │  ├ HitObjectScheduler      │    │
│                                        │  ├ JudgementEngine         │    │
│                                        │  ├ ScoreCalculator (V1)    │    │
│                                        │  └ AudioClock              │    │
│                                        │ Renderer (PixiJS) + Skin   │    │
│                                        └────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

Puntos clave:
- **Hardware simulado detrás de interfaces.** `CoinAcceptor`, `CardReader` y `TicketDispenser` son interfaces. La implementación es `Simulated`: entrada por teclado (moneda = `C`, tarjeta = `T` con UID de prueba) y dispensado con animación. Si algún día se cambia a hardware, solo se reemplaza la implementación.
- **El motor del juego no depende del DOM ni de Electron.** Se prueba con Vitest.
- **Créditos, tickets y ranking viven en el main process.** El renderer solo pide acciones por IPC.
- **SQLite local.** Funciona sin internet. Tablas: `credits`, `plays`, `cards` (UID, saldo de tickets), `ticket_ledger` (movimientos), `scores` (top 50 por mapa), `skins_selected`.
- **Transacciones**: depósito + jugadas, y partida + tickets + ledger, se escriben juntos.

Flujo de una moneda simulada:
`SimulatedCoinAcceptor (tecla C)` → `main: CreditService.add(1)` → `IPC: credits.changed` → `UI: animación + tick`.

---

## 10. Stack tecnológico

| Capa | Elección | Por qué |
|---|---|---|
| Shell de escritorio | **Electron** | Pantalla completa, empaquetado para Windows/Linux |
| Lenguaje | **TypeScript** (estricto) | Parseo de formatos y reglas de puntaje son fáciles de equivocar |
| Build UI | **Vite** | Rápido, HMR en desarrollo |
| Render del juego | **PixiJS v8** | 2D por WebGL, tweens nativos |
| Animación UI | **GSAP** | Timelines para ranking, transiciones, contadores, dispensado |
| Audio | **Web Audio API** | Latencia baja y reloj preciso para el timing |
| Descompresión `.osz` | **fflate** | ZIP en JS, sin dependencias nativas |
| Persistencia | **better-sqlite3** (en main) | Síncrono, transaccional, un archivo |
| Tests | **Vitest** (lógica), **Playwright** (flujo de pantallas) | Playwright ya está en el entorno |
| Empaquetado | **electron-builder** | Instalador para la máquina |

Alternativa descartada: **Unity/Godot**. La carga de `.osz` y la UI tipo web son más directas en TS.

---

## 11. Simulación de hardware

Como es un proyecto educativo, el hardware no se integra. Se simula con interfaces y animaciones:

| Componente | Simulación | Animación |
|---|---|---|
| Aceptador de monedas | Tecla `C` o botón en pantalla de prueba | Moneda que cae y destello |
| Lector de tarjeta | Tecla `T` con UID de prueba; botón "registrar nueva tarjeta" | Tarjeta que se desliza, UID y saldo |
| Dispensador de tickets | Acredita el saldo y "imprime" tiras | Tiras que salen por una ranura |
| Entrada de juego | Mouse / trackball y teclas Z / X | Cursor de osu!standard |

Un **modo operador** (con una combinación de teclas oculta) permite cambiar `config.json`, ver el saldo de las tarjetas simuladas y reiniciar el ranking.

---

## 12. Plan de prototipo (orden de trabajo)

1. **Parser `.osu` + tests**: leer un mapa real y listar los `HitObjects`.
2. **Importador `.osz`** con fflate: indexar mapas y skins.
3. **ScoreV1 y juicios** en consola, con tests contra valores de la wiki de osu!.
4. **Renderer PixiJS**: círculos, aro de approach, HUD, juicios. Skin default.
5. **Pantallas**: attract → selección de mapa con preview → juego → resultados.
6. **Créditos, jugadas y tarjeta simulada** con UID y saldo de tickets.
7. **Ranking top 50** con animación de inserción y nombre de 8 caracteres.
8. **Tutorial, video promo, selección de skin** y animaciones pulidas.
9. **Modo operador** y ajuste de `config.json`.

Criterio de aceptación: un `.osz` real se carga, suena el preview, el mapa se juega con juicios y puntaje ScoreV1, los tickets se acreditan a una tarjeta simulada, y un puntaje top 50 entra al ranking con animación.

---

## 13. Decisiones abiertas

1. **Tarjeta y moneda**: ¿pasar la tarjeta da un depósito (3 jugadas) como la moneda, o la tarjeta solo sirve para acumular tickets? La propuesta actual es que da un depósito. Si pagó con moneda y no pasó tarjeta, los tickets se pierden.
2. **Tabla de dificultad de ScoreV1**: confirmar los multiplicadores exactos en la wiki de osu! antes de implementar §5.
3. **Premios**: los nombres y costos de §4 son ejemplos. Falta el catálogo real si quieren mostrarlo.
4. **Nombre "POiSU"**: suena casi igual a "osu!", y eso puede traer el mismo problema de marca que el nombre anterior. Conviene decidirlo antes de hacer logo y video promo.

---

*Diseño sin código todavía: el primer paso del plan (§12) es el parser `.osu`.*
