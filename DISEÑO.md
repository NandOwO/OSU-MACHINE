# POIPIU — Diseño v0.2

Réplica del modo **osu!standard** (el de cursor, no mania ni taiko) con temática de máquina arcade. Se juega con monedas o tarjeta, y los mapas se leen desde archivos `.osz`.

> **Proyecto educativo.** Cobros, tickets y premios son **simulados** (con animación), no hay dinero ni premios reales. Si algún día se usaran de verdad, habría que revisar la normativa local antes.

---

## 0. Decisiones confirmadas y valores por defecto

| Tema | Decisión | Detalle |
|---|---|---|
| Jugadas por depósito | **3 jugadas por depósito** | Cada jugada puede ser un reintento o un cambio de mapa |
| Tickets por partida | **Configurable, calculados sobre el puntaje relativo al máximo del mapa** | Ver §4 (el puntaje ScoreV1 cruda no sirve, depende de la longitud del mapa) |
| Nombre en ranking | **Hasta 8 caracteres** | Configurable; por defecto se pide el máximo |
| Puntaje | **Lo más cercano posible a osu! (ScoreV1)** | Ver §5 |
| Hardware | **Simulado** | Monedas, tarjeta y tickets con simulador y animaciones (ver §11) |
| Tickets | **Se acreditan a la tarjeta registrada (UID)** | Saldo persistente por tarjeta |
| Video promocional | **Hecho con los mapas y el arte del proyecto** | Sin grabación externa |
| Nombre del proyecto | **POIPIU** | Tema central: los **puntos** (puntaje y tickets) |
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
- Spinners: pendientes. Si el mapa de validación (§5, caso #2) tiene alguno, entran en v1.

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
│                    ▌ POIPIU ▐                            │
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
    "maxPerPlay": 100,
    "curveExponent": 2,
    "minObjectsForTickets": 50,
    "cardRequired": true,
    "claimMode": "all"
  },
  "economy": {
    "currency": "PEN",
    "depositPrice": 6.0,
    "prizeUnitCost": 48.0,
    "prizeUnitTickets": 3000,
    "targetPayoutPct": [20, 30]
  },
  "prizes": [
    { "name": "Funko Pop estándar", "tickets": 3000 },
    { "name": "Peluche grande (~40 cm)", "tickets": 3500 },
    { "name": "Audífonos inalámbricos básicos", "tickets": 4000 },
    { "name": "Parlante Bluetooth portátil", "tickets": 5000 },
    { "name": "Mouse gamer + mousepad", "tickets": 6000 },
    { "name": "Funko Pop edición especial", "tickets": 8000 },
    { "name": "Gamepad inalámbrico", "tickets": 10000 }
  ],
  "leaderboard": {
    "size": 50,
    "nameMaxLength": 8,
    "nameCharset": "A-Z0-9 _-"
  },
  "tutorial": { "enabledFirstSession": true, "skippable": true }
}
```

### 4.1 Cálculo del negocio

**Problema de usar el puntaje crudo.** En ScoreV1 el puntaje máximo crece con el cuadrado de la cantidad de objetos (ver §5): un mapa de 1000 objetos llega a ~30 millones y uno de 300, a ~3 millones. Si los tickets fueran `puntaje / k`, los mapas largos regalarían muchísimos más tickets. Se normaliza contra el máximo del mapa.

**Fórmula de tickets por partida:**

```
r       = puntaje_ScoreV1 / Max_del_mapa          (0 a 1, ver §5)
tickets = round( maxPerPlay × r ^ curveExponent )
```

- `r` mide qué tan cerca estuvo el jugador de la partida perfecta (precisión **y** combo, igual que ScoreV1).
- `curveExponent = 2` premia más lo bueno: la mitad del puntaje máximo da un cuarto de los tickets.
- Un mapa fácil y uno difícil pagan igual a igual `r`. El jugador elige el mapa por gusto, no por farmear tickets.

**Valor del ticket.** Todos los premios se valúan con el mismo precio por ticket:

```
valor_ticket = prizeUnitCost / prizeUnitTickets = 48 / 3000 = S/ 0,016
```

**Equivalencia confirmada:** la economía de 8 unidades por Funko sigue vigente, con **1 unidad = 1 depósito = S/ 6,00** (3 jugadas, S/ 2,00 por jugada). El Funko cuesta a la casa `8 × 6 = S/ 48`, aproximadamente la mitad de su precio de venta en tiendas peruanas (listados de S/ 80 a S/ 115 en Falabella Perú). Como el proyecto es educativo, no hay moneda real: son soles simulados.

**Tabla (con `maxPerPlay = 100`, exponente 2, 3 jugadas por depósito, mismo `r` en las 3):**

| `r` | Tickets por partida | Tickets por depósito | Depósitos para un Funko (3000) | Pago al jugador (% del depósito) |
|---|---|---|---|---|
| 1,0 | 100 | 300 | 10,0 | 80,0 % |
| 0,9 | 81 | 243 | 12,3 | 64,8 % |
| 0,8 | 64 | 192 | 15,6 | 51,2 % |
| 0,7 | 49 | 147 | 20,4 | 39,2 % |
| 0,6 | 36 | 108 | 27,8 | 28,8 % |
| 0,5 | 25 | 75 | 40,0 | 20,0 % |
| 0,4 | 16 | 48 | 62,5 | 12,8 % |
| 0,3 | 9 | 27 | 111,1 | 7,2 % |
| 0,2 | 4 | 12 | 250,0 | 3,2 % |
| 0,1 | 1 | 3 | 1000,0 | 0,8 % |

**Pago esperado de la máquina.** Con una mezcla supuesta de jugadores:

| Tipo de jugador | Proporción | `r` típico |
|---|---|---|
| Nuevo / casual | 30 % | 0,30 |
| Casual con práctica | 30 % | 0,50 |
| Regular | 25 % | 0,70 |
| Bueno | 10 % | 0,85 |
| Experto | 5 % | 0,95 |

- Tickets promedio por depósito: **≈ 102,5**.
- Pago promedio: `102,45 × 0,00267 ≈ 0,273` unidades, o sea **≈ 27 %** del depósito. Queda dentro del objetivo de 20–30 % (`targetPayoutPct`).
- Margen bruto de la máquina: **≈ 73 %** (antes de otros costos).
- Un jugador promedio de esa mezcla tarda ≈ 29 depósitos en juntar un Funko, ≈ 5 en un llavero (500) y ≈ 15 en el peluche (1500).

**Qué se ajusta y para qué:**

| Palanca | Efecto |
|---|---|
| `maxPerPlay` | Escala todos los tickets a la vez. Si el pago esperado se pasa del objetivo, bajarlo |
| `curveExponent` | Más alto = solo los buenos ganan; más bajo = todos ganan algo |
| `playsPerDeposit` | Más jugadas = más tickets por depósito |
| `prizeUnitCost` / `prizeUnitTickets` | Cambian el valor del ticket sin tocar el juego |
| `depositPrice` | Relación entre lo que entra y lo que sale |

> **Supuestos.** La mezcla de jugadores, el costo del Funko (8 unidades) y el objetivo de 20–30 % son **supuestos míos**, no datos. Hay que reemplazarlos tras observar partidas reales. Los valores de `r` por tipo de jugador son los más inciertos: ScoreV1 castiga mucho los combos rotos, así que un jugador de 85 % de precisión suele tener un `r` bastante menor que 0,85.

### 4.2 Catálogo de premios (mercado peruano)

Todos los premios usan el mismo valor de ticket (S/ 0,016), así que el costo para la casa es `tickets × 0,016`. **El premio más barato es el Funko (3 000 tickets)**, como definiste: no hay premios menores.

| Premio | Tickets | Costo para la casa | Precio de venta aprox. | Depósitos (jugador promedio) |
|---|---|---|---|---|
| Funko Pop estándar | 3 000 | S/ 48 | S/ 80–115 | ≈ 29 |
| Peluche grande (~40 cm) | 3 500 | S/ 56 | S/ 90–120 | ≈ 34 |
| Audífonos inalámbricos básicos | 4 000 | S/ 64 | S/ 100–130 | ≈ 39 |
| Parlante Bluetooth portátil | 5 000 | S/ 80 | S/ 110–150 | ≈ 49 |
| Mouse gamer + mousepad | 6 000 | S/ 96 | S/ 130–180 | ≈ 59 |
| Funko Pop edición especial | 8 000 | S/ 128 | S/ 200–400 | ≈ 78 |
| Gamepad inalámbrico | 10 000 | S/ 160 | S/ 200–250 | ≈ 98 |

> **Origen de los precios.** Solo el rango del Funko estándar (S/ 80–115) y el techo de ediciones limitadas (hasta ≈ S/ 400) vienen de listados de Falabella Perú. El resto de los precios de venta son **estimaciones mías** para un catálogo plausible; no los verifiqué con tiendas. Tampoco encontré precios actuales de fichas o partidas en salones de Lima: los S/ 6 por depósito son un supuesto.

Con esta estructura el Funko es lo mínimo que un jugador puede canjear. Si luego quieren premios chicos (golosinas, llaveros) para que los jugadores casuales también ganen algo, se agregan con pocos cientos de tickets y el pago esperado sube en consecuencia.

**Regla de seguridad.** Si el tamaño real de un mapa distorsiona `Max` (por ejemplo, con 2 objetos), se exige un mínimo de objetos para pagar tickets (`minObjectsForTickets`, propuesta: 50).

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

**Puntaje por golpe (ScoreV1, fórmula oficial):**

```
puntos = V + V × ( C × D × M ) / 25
```

| Símbolo | Significado |
|---|---|
| `V` | Valor base del juicio (300 / 100 / 50; MISS = 0) |
| `C` | `max(combo_antes_del_golpe − 1, 0)`: el primer golpe de una racha no tiene bonus |
| `D` | Multiplicador de dificultad del mapa (ver abajo) |
| `M` | Multiplicador de mods: **1** (no hay mods en POIPIU) |

**Multiplicador de dificultad `D`** (usa siempre los valores originales de HP, CS y OD del mapa):

```
D = round( ( HP + CS + OD + clamp( n_objetos / t_drenaje_seg × 8, 0, 16 ) ) / 38 × 5 )
```

- `n_objetos`: cantidad total de objetos del mapa.
- `t_drenaje_seg`: segundos entre el primer y el último objeto, sin contar los descansos (*breaks*).
- `D` es un entero. Se calcula **una vez por mapa** al indexar el `.osz`.

> **Estado de verificación.** No pude abrir la wiki de osu! desde este entorno (el proxy la bloquea). La estructura `V + V·(C·D·M)/25`, el `C = combo − 1` con piso en 0 y la forma de `D` (÷38, ×5, redondeo, densidad acotada a 0–16) coinciden con el resumen de la wiki que devolvió la búsqueda y con mi conocimiento previo, pero **no comparé contra la página**. Antes de dar por cerrado el módulo, validar con un resultado real conocido: tomar un mapa y un replay/puntaje publicado y comprobar que el cálculo da el mismo número.

**Sliders (decidido: entran en v1).** En el puntaje oficial el combo cuenta también los ticks y extremos de los sliders (ver los casos de validación: 331 y 321 de combo con 194 y 283 objetos). Para acercarse al puntaje de osu! hay que modelar cada slider como un conjunto de elementos: cabeza, ticks, repeticiones y extremo. Los valores de bonus de ScoreV1 que recuerdo son 30 (cabeza, repetición y extremo) y 10 (tick), planos y sin multiplicador de combo, pero **no están verificados**: se confirman con el caso #2.

Consecuencias de diseño:
- El motor necesita seguir el cursor dentro del slider (la "bola"): perder el seguimiento rompe ticks y extremo.
- La geometría de sliders (Bézier, lineal, perfecto/arco, Catmull) es parte de v1.
- Los **spinners** quedan para cuando un caso de validación los requiera.

**Caso de validación #1 (captura real, pendiente de datos del mapa):**

| Dato de la captura | Valor |
|---|---|
| Puntaje | 1 386 005 |
| Precisión mostrada | 97,93 % |
| Combo máximo | 331x |
| Great (300) / Ok (100) / Meh (50) / Fallos | 188 / 6 / 0 / 0 |
| Objetos totales | 194 (suma de los juicios) |
| Cliente | Stable |

Lo que sí se verifica con la captura:
- **Precisión:** `(300·188 + 100·6) / (300·194) = 57 000 / 58 200 = 97,938 %`. La captura muestra 97,93 %, o sea coincide cortando (no redondeando) el tercer decimal. La fórmula de §5 queda confirmada.
- **Combo > objetos:** 331 de combo con 194 objetos prueba que los ticks y extremos de los sliders suman combo en el puntaje oficial.

**Caso de validación #2 (replay `.osr`, el mejor candidato):**

Datos leídos del archivo `Thericks - DIALOGUE - Deneb to Spica (TV Size) [Erisus' Insane]`, replay del 2026-10-02:

| Dato del replay | Valor |
|---|---|
| Modo | 0 (osu!standard) |
| Hash MD5 del mapa | `58a613f1f28b2b9388413b4ef5a30dd3` |
| Mods | **ninguno** (`M = 1`) |
| Puntaje | 1 587 776 |
| 300 / 100 / 50 / Miss | 236 / 39 / 1 / 7 |
| Geki / Katu | 37 / 21 |
| Combo máximo | 321x |
| Objetos totales | 283 (236 + 39 + 1 + 7) |
| Frames de cursor | 5 268 |

- **Precisión:** `(300·236 + 100·39 + 50·1) / (300·283) = 74 750 / 84 900 = 88,04 %`.
- **Por qué sirve:** no tiene mods y trae el movimiento del cursor y las teclas. Con el mapa, se puede **reproducir la partida en el motor** y comprobar que da las mismas cuentas de 300/100/50/miss, el mismo combo máximo y el mismo puntaje.
- **No coincide con la captura del caso #1** (otra fecha, otro puntaje, otros juicios). Son dos partidas distintas.
**Resultado de la validación (con el `.osz` recibido).** El hash del replay coincide con la dificultad *Erisu's Insane* del `.osz` (355 objetos: 212 círculos, 142 sliders, 1 spinner). El replay termina en 72 393 ms, justo en el objeto 283 de 355: es una partida cortada, no completa. Se reprodujo en el simulador (`src/sim/replaySim.ts`):

| | Replay real | Simulador |
|---|---|---|
| 300 / 100 / 50 / Miss | 236 / 39 / 1 / 7 | **236 / 39 / 1 / 7** (exacto) |
| Combo máximo | 321 | **321** (exacto) |
| Multiplicador de dificultad `D` | — | 4 (HP 6, CS 3,8, OD 8; 355 objetos en 89,0 s) |
| Puntaje | 1 587 776 | 1 586 542 (**−1 234 puntos, −0,078 %**) |

Lo que quedó confirmado con esto:
- La fórmula `V + V·(C·D·M)/25` y el cálculo de `D = 4` son consistentes con el replay: el puntaje queda a 0,08 % del real, y las variantes que probé (otras reglas de cola, ventanas no estrictas) quedan mucho más lejos. Esto es un ajuste excelente, no una igualdad exacta, mientras queden los 1 234 puntos sin explicar.
- Las **ventanas de juicio son estrictas** (`delta < ventana`, no `≤`). Con `≤` el simulador da 239/36/1/7.
- **Perder la cola de un slider no rompe el combo**; solo baja el juicio del slider. Perder cabeza, tick o repetición sí lo rompe.
- La cola de un slider se evalúa 36 ms antes de su final (`endTime − 36`), seguida con un radio de `2,4 × R`.
- El juicio final del slider se calcula con el combo **incluyendo** su cola. Calcularlo con el combo previo da 1 581 294, 5 mil puntos más lejos.
- El **spinner suma 1 al combo** (sin eso el combo máximo daría 320) y recibe juicio como cualquier objeto.
- Bonus planos de slider (cabeza 30, repetición 30, cola 30, tick 10) coherentes con el puntaje total.

**Lo que no está resuelto:** los 1 234 puntos de diferencia. La hipótesis más probable son los puntos por giro del spinner (el cursor dio ≈ 5,8 vueltas en sus 1,08 s), que el simulador todavía no modela. No lo cerré porque no tengo verificada la regla exacta de puntos por giro y bonus de ScoreV1, y no quise ajustarla a ojo hasta que el número cuadre. Hasta entonces, la prueba automática exige coincidencia exacta de juicios y combo, y una diferencia de puntaje menor al 0,1 %.

Consecuencia para §4: el máximo de §5 (`300·n + 6·D·(n−1)·(n−2)`) vale solo para mapas de círculos. Con sliders y spinner, el `Max` del mapa se obtiene **simulando una partida perfecta**.

Lo que **no** se puede verificar con el caso #1 (la captura):
- El puntaje 1 386 005 exige conocer HP, CS, OD, el tiempo de drenaje y la estructura de sliders del mapa, y la captura no muestra el nombre del mapa. Además hay dos íconos de mods sobre el puntaje y no los identifico; si hay un mod con multiplicador, `M ≠ 1`.
- La captura **no corresponde a ninguna dificultad del `.osz` recibido** (216, 355, 432 y 269 objetos; la captura tiene 194). Es de otro mapa.

**Puntaje máximo de un mapa (para el negocio, §4):**
solo círculos, todo en 300, sin romper combo:

```
Max = 300·n + 6 · D · (n − 1) · (n − 2)
```

Ejemplo: `n = 1000`, `D = 5` → `300 000 + 6·5·999·998 = 30 210 060`. Un mapa de 1000 objetos tiene un máximo de ~30 millones, no de ~1 millón. Por eso los tickets no pueden calcularse con el puntaje crudo.

**Precisión (como en osu!):**
`ACC = (300·n300 + 100·n100 + 50·n50) / (300 · total_objetos)`, en porcentaje. Equivale a `(n300·3 + n100·1 + n50·0,5) / (3 · total)`.

**Vectores de prueba** (para los tests de `ScoreCalculator`, con `D = 5`):

| Caso | Resultado esperado |
|---|---|
| 1 solo objeto, 300 | 300 |
| 2 objetos, ambos 300 | 600 (el segundo tiene `C = 0`) |
| 3 objetos, todos 300 | `300 + 300 + 300 + 300·(1·5)/25 = 960` |
| 1000 objetos, todos 300 | 30 210 060 |
| 1000 objetos, todos MISS | 0 |

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
3. **ScoreV1, juicios y sliders** en consola, con tests de los vectores de §5 y **validación con el replay `.osr`** del caso #2 (lector de `.osr` incluido).
4. **Renderer PixiJS**: círculos, aro de approach, HUD, juicios. Skin default.
5. **Pantallas**: attract → selección de mapa con preview → juego → resultados.
6. **Créditos, jugadas y tarjeta simulada** con UID y saldo de tickets.
7. **Ranking top 50** con animación de inserción y nombre de 8 caracteres.
8. **Tutorial, video promo, selección de skin** y animaciones pulidas.
9. **Modo operador** y ajuste de `config.json`.

Criterio de aceptación: un `.osz` real se carga, suena el preview, el mapa se juega con juicios y puntaje ScoreV1, los tickets se acreditan a una tarjeta simulada, y un puntaje top 50 entra al ranking con animación.

---

## 13. Decisiones abiertas

**Resueltas**
- Tarjeta y moneda: pasar la tarjeta da un depósito (3 jugadas), igual que la moneda. Si se paga con moneda y no se pasa tarjeta, los tickets se pierden.
- Economía: costo del premio (8 unidades), objetivo de pago (20–30 %) y mezcla de jugadores de §4.1, confirmados.
- Catálogo de premios: definido en §4.2 con precios estimados para Perú.

**Abiertas**
1. **Puntos de giro del spinner** (§5, caso #2): quedan 1 234 puntos (0,078 %) sin explicar. Se cierra modelando la rotación del spinner con la regla oficial de ScoreV1. Un segundo replay con spinner ayudaría a confirmarla.
2. **Captura del caso #1**: es de otro mapa (no coincide con ninguna dificultad del `.osz`). Sirve de validación extra si se envía su `.osz`.
3. **Precio del depósito**: S/ 6 por 3 jugadas es un supuesto sin dato de mercado detrás.

**Resuelta:** los sliders entran en v1 (§5).

---

*Estado del código: el plan (§12) lleva hecho el parser `.osu`, la geometría y eventos de sliders, el cálculo de ScoreV1, el lector de `.osr` y un simulador que reproduce replays (`npm test`). Los archivos de validación son de terceros y no se suben al repositorio (`fixtures/README.md`).*
