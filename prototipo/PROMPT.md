# Prompt para el prototipo de POIPIU

Este texto está escrito para pegarse completo en una herramienta de diseño/prototipado con IA (o dárselo a un desarrollador). Es autosuficiente: no depende de otros archivos, salvo el logo (`logo/poipiu-logo.svg`) y los tokens (`tokens.css`), que se adjuntan.

---

## Rol y objetivo

Eres un diseñador de producto y desarrollador front-end senior, especializado en interfaces de juegos arcade. Construye un **prototipo navegable en HTML, CSS y JavaScript** de **POIPIU**, una máquina arcade que replica el modo **osu!standard** (el de cursor: círculos, sliders y spinners; no mania, ni taiko, ni catch).

El prototipo sirve para **validar el flujo, la estética y las animaciones** antes de construir el producto real. No necesita el motor de juego real: el juego se simula con círculos de demostración y datos de ejemplo.

## Contexto del producto

- Es un **proyecto educativo**. El cobro, las monedas, la tarjeta y la entrega de tickets son **simulados con animaciones**: no hay dinero real ni hardware real.
- La máquina vive a pantalla completa (**1920×1080**, horizontal), operada con un **mouse o trackball** como cursor, y las teclas **Z** y **X** como botones.
- Espera que se inserte una moneda o se pase una tarjeta antes de dejar jugar.
- El nombre **POIPIU** hace referencia a los **puntos**: el puntaje y los tickets son el centro visual de toda la interfaz.
- Idioma de la interfaz: **español**. Textos arcade clásicos (`INSERT COIN`, `GAME OVER`, `TOP 50`) se dejan en inglés.

## Identidad visual

- **Estilo**: arcade neón oscuro, con brillo (glow) en bordes y textos. Referencias de ambiente: máquinas de ritmo de salón de juegos, luces de neón, scanlines muy sutiles. Evitar el estilo "app de oficina".
- **Logo**: usar `logo/poipiu-logo.svg` (la **O** es un círculo de osu! con su anillo de aproximación y un punto amarillo al centro; las **I** llevan un punto amarillo). No modificarlo ni redibujarlo.
- **Colores**: usar exactamente las variables de `tokens.css`:
  `--bg-0 #07061A`, `--bg-1 #12102E`, `--bg-2 #1E1A45`, `--neon-pink #FF2E88`, `--neon-cyan #00E5FF`, `--neon-yellow #FFD23F` (créditos, tickets, puntos), `--neon-lime #7CFF4F` (juicio 300), `--judge-100 #4FC3F7`, `--judge-50 #FFB74D`, `--judge-miss #FF3B3B`, `--text #F5F5FF`, `--text-dim #8C88B8`.
- **Tipografía**: `Press Start 2P` para títulos, créditos, puntajes y nombres del ranking; `Rajdhani` para textos de lectura. Ambas de Google Fonts.
- Solo **modo oscuro**. Contraste mínimo 4,5:1 en todo texto de lectura; `--text-dim` solo para información secundaria.
- El amarillo (`--neon-yellow`) se reserva para **puntos, créditos y tickets**. No usarlo como decoración.

## Flujo completo (todas las pantallas deben ser navegables)

```
ATTRACT → CRÉDITO → TUTORIAL (omitible) → SKIN → MAPA → JUEGO → RESULTADOS
                                                              │
                                          ┌───────────────────┴──────────────┐
                                    entra al top 50                    no entra
                                          │                                  │
                                    NOMBRE + RANKING                 ¿quedan jugadas?
                                          │                          sí → MAPA / no → ATTRACT
                                          └──────────────► (mismo chequeo)
```

Pasar la tarjeta en ATTRACT también permite **reclamar tickets** acumulados (pantalla de canje).

## Pantallas

Para cada pantalla: disposición, elementos, interacción y animación. Todas las duraciones son orientativas y deben mantenerse en un rango de ±20 %.

### 1. Attract (reposo)
- Fondo: **video promocional en loop** (en el prototipo, un placeholder animado: círculos de osu! apareciendo y cerrándose sobre un degradado oscuro). Ver `storyboard-promo.md`.
- Centro: logo POIPIU grande, con latido suave (escala 1 → 1,03, 2 s).
- Debajo: `INSERT COIN / PASA TU TARJETA` parpadeando a **1 Hz**.
- Esquina inferior izquierda: `CRÉDITOS: 0`. Inferior derecha: `TOP: <nombre> <puntaje>` del primer lugar del ranking.
- Cada 20 s, el fondo alterna entre el video y un **carrusel de ranking** (los 5 mejores).
- **Interacción**: tecla `C` = moneda, tecla `T` = tarjeta, y también dos botones discretos en una barra "modo demo" abajo del todo (para probar con mouse).

### 2. Crédito (moneda o tarjeta)
- **Moneda**: una moneda cae por una ranura dibujada en el borde de la pantalla (300 ms), destello, el contador de créditos sube con "tick".
- **Tarjeta**: una tarjeta se desliza sobre un lector dibujado (500 ms); aparece su ID (`UID …A3F2`) y su saldo de tickets.
- Un depósito da **3 jugadas**. Mostrar `3 JUGADAS` con tres íconos de círculo que se encienden.
- Botón grande `COMENZAR` (pulso de brillo rosa).

### 3. Tutorial (3 pasos, omitible)
Solo en la primera sesión o si se pide. Cada paso es una mini-demostración jugable:
1. **Timing**: un círculo aparece con su aro; texto `Haz clic cuando el aro toque el círculo`.
2. **Cursor y combo**: tres círculos en secuencia; el contador de combo sube.
3. **Juicios y puntaje**: se muestran `300`, `100`, `50`, `MISS` con sus colores, y cómo suma el puntaje.
- Barra de progreso de 3 puntos abajo. Botón `SALTAR ▶` siempre visible. Duración total ≈ 30 s.

### 4. Selección de skin
- Carrusel central con una **vista previa en vivo**: tres círculos con aro, el cursor y los juicios `300/100/50/MISS` dibujados con la skin elegida.
- Flechas `◀ ▶` o mover el cursor a los bordes. Nombre de la skin y quién la creó debajo.
- Skins de ejemplo: **Default**, **Neon Cyan**, **Retro Pixel**, y una **"Mi skin.osz"** importada (para mostrar que se cargan desde un archivo `.osz`).
- Botón `CONFIRMAR`.

### 5. Selección de mapa (con preview)
- Carrusel horizontal de **portadas** con el mapa enfocado más grande al centro.
- Datos del mapa enfocado: título, artista, creador, dificultad con estrellas, duración, cantidad de objetos, AR/CS/OD.
- **Preview de audio**: una forma de onda animada que avanza durante 15 s (en el prototipo, simulada). Al cambiar de mapa, la forma de onda "cruza" a la nueva en 300 ms.
- Panel derecho: **top 3 del ranking de ese mapa**.
- Arriba a la derecha: `JUGADAS: 3` con los círculos encendidos. Un **cambio de mapa o reintento consume una jugada**.
- Mapas de ejemplo (datos ficticios): `Deneb to Spica (TV Size)` — DIALOGUE+, 4 dificultades; y dos mapas más inventados.

### 6. Juego (HUD sobre un campo de demostración)
- Campo 4:3 centrado, con fondo del mapa muy oscurecido.
- Círculos numerados que aparecen con fade-in y un **aro de aproximación** que se encoge hasta el tamaño del círculo (ver reglas de tiempo abajo). Un slider de ejemplo con su bola y su seguimiento. El **cursor** es un círculo cian con estela.
- HUD: arriba izquierda `SCORE` (odómetro, `Press Start 2P`); arriba derecha `ACC xx,xx%`; abajo izquierda `COMBO xNN` (pulsa al subir, se apaga al romperse); abajo centro barra de progreso de la canción; abajo derecha `JUGADA 2/3`.
- Juicios que **suben y se desvanecen en 400 ms** sobre el punto de golpe: `300` (lima), `100` (celeste), `50` (naranja), `MISS` (rojo).
- Cuenta regresiva `3 · 2 · 1` con escala y fade antes de empezar.
- **Interacción en el prototipo**: clic o `Z`/`X` golpean. Puede ser una secuencia fija de 20–30 círculos de ~25 s; no hace falta física real, solo que se sienta bien.

**Reglas de tiempo y tamaño (para que la sensación sea correcta):**
- Radio del círculo (px de osu!): `R = 54,4 − 4,48 × CS`. Con `CS = 3,8` queda en 37,4.
- El aro empieza en ~2,4 × el radio y llega al radio exactamente a la hora del golpe.
- Tiempo de aparición (ms): `1200 + 600×(5−AR)/5` si AR < 5; `1200` si AR = 5; `1200 − 750×(AR−5)/5` si AR > 5. Con `AR = 9` son 600 ms.
- Ventanas de juicio con `OD = 8`: `300` ±32 ms, `100` ±76 ms, `50` ±120 ms.

### 7. Resultados y tickets
- Título `¡COMPLETADO!` (o `FALLASTE` si la vida llegó a 0), con una letra de rango grande (**S, A, B, C, D**) que entra con rebote.
- Desglose: `300 / 100 / 50 / MISS`, combo máximo, precisión, puntaje. El puntaje cuenta de 0 hasta el valor en ~1,5 s.
- **Tickets ganados**: tickets amarillos **vuelan** desde el puntaje hasta el contador de la tarjeta. Mostrar la fórmula en pequeño: `tickets = 100 × (tu puntaje / puntaje máximo del mapa)²`.
- Si no se pasó tarjeta, avisar: `SIN TARJETA: LOS TICKETS SE PIERDEN`.
- Botones: `REINTENTAR (N)` y `CAMBIAR MAPA`. Si no quedan jugadas, `TERMINAR`.

### 8. Ingreso de nombre y ranking top 50
Cuando el puntaje entra al top 50:
1. Se muestra la lista (filas de 56 px, puesto, nombre, puntaje). La nueva fila **aparece desde arriba y baja** hasta su posición; las filas inferiores se **desplazan una posición hacia abajo** (400 ms, con rebote). La fila nueva brilla en rosa.
2. En la fila, el nombre es editable: **hasta 8 caracteres** (`A–Z`, `0–9`, espacio, `_`, `-`). Cursor parpadeante. Teclado físico o ▲▼ para cambiar la letra con efecto de "rueda", ◀▶ para mover, `ENTER` para confirmar.
3. Al lado, el **puntaje** de la fila nueva.
4. Al confirmar, destello amarillo y un mensaje `PUESTO #17`.
- Lista de ejemplo: 50 entradas con nombres de 3–8 caracteres y puntajes decrecientes entre 31 200 000 y 1 800 000.

### 9. Canje de tickets (al pasar la tarjeta en reposo)
- Muestra el saldo y el **catálogo de premios** (cada uno con su costo en tickets; los que no alcanzan se ven atenuados):
  `Funko Pop estándar — 3 000`, `Peluche grande (~40 cm) — 3 500`, `Audífonos inalámbricos básicos — 4 000`, `Parlante Bluetooth portátil — 5 000`, `Mouse gamer + mousepad — 6 000`, `Funko Pop edición especial — 8 000`, `Gamepad inalámbrico — 10 000`.
- Al canjear, **tiras de tickets** salen por una ranura simulada (animación) y el saldo baja.

### 10. Modo operador (oculto)
- Se abre con `Ctrl+Shift+O`. Panel simple para editar: jugadas por depósito (3), tickets máximos por partida (100), exponente de la curva (2), largo del nombre (8), y reiniciar ranking. Solo en el prototipo.

## Animaciones (resumen)

| Momento | Animación | Duración |
|---|---|---|
| Logo en attract | Latido de escala | 2 s, loop |
| `INSERT COIN` | Parpadeo | 1 Hz |
| Moneda | Cae por la ranura + destello | 300 ms |
| Tarjeta | Se desliza sobre el lector | 500 ms |
| Cuenta regresiva | Escala + fade por número | 3 × 800 ms |
| Círculo | Fade-in; el aro se encoge | según AR |
| Juicio | Sube y se desvanece | 400 ms |
| Combo | Pulso al subir | 150 ms |
| Puntaje | Odómetro | ~1,5 s |
| Tickets | Vuelan al contador | 800 ms |
| Ranking | Filas se desplazan, nueva con rebote | 400 ms |
| Transición entre pantallas | Fade a negro corto; wipe horizontal para mapas | 300 ms |

Usar **GSAP** para las animaciones de interfaz y **requestAnimationFrame** o un canvas para el campo de juego. Respetar `prefers-reduced-motion` (sin parpadeos ni sacudidas, pero con los mismos estados).

## Sonido (opcional en el prototipo, pero dejar los ganchos)
Efectos sintetizados o libres de derechos: moneda, tick de crédito, golpe (`hit`), `300/100/50/miss`, ruptura de combo, tickets saliendo, campanilla, acorde de victoria, máquina de escribir arcade. Todo con un control de volumen global y botón de silencio.

## Datos de ejemplo
- 3 mapas (portada, título, artista, estrellas, duración, objetos).
- Ranking top 50 con nombres arcade.
- Una tarjeta de prueba `UID …A3F2` con 2 840 tickets.
- 3 skins.
- Una lista de 7 premios (arriba).

## Restricciones técnicas
- Un solo proyecto HTML + CSS + JS, sin servidor, que abra con doble clic. Librerías por CDN con **versión exacta**: GSAP 3.12.5.
- Diseño de referencia **1920×1080**, escalado proporcional a otros tamaños de pantalla. Legible a 1280×720.
- Navegable solo con **mouse + teclas Z/X/C/T/Enter/flechas**. Sin hover como única forma de acción (es una máquina de uso en pie).
- Sin dependencias de red para funcionar, salvo las fuentes (con fallback).
- Código ordenado por pantalla, con una función por pantalla y un objeto de estado central.

## Qué NO hacer
- No inventar otro logo ni otra paleta.
- No usar texto en español neutro en los carteles arcade: déjalos en inglés.
- No añadir pantallas de login, registro, menú de ajustes ni redes sociales.
- No integrar hardware real ni cobros reales.
- No implementar los modos mania, taiko ni catch.

## Criterios de aceptación
1. Se recorre el flujo completo de principio a fin sin recargar la página.
2. Se puede entrar al top 50, escribir un nombre de hasta 8 caracteres y ver la animación de inserción con el puntaje al lado.
3. Al pasar la tarjeta se ve el saldo y se puede canjear un premio con animación de tickets.
4. Un depósito da 3 jugadas y cada reintento o cambio de mapa descuenta una.
5. Los colores y las tipografías salen exclusivamente de `tokens.css`.
6. Todas las animaciones de la tabla existen y duran lo indicado (±20 %).
7. Se ve bien a 1920×1080 y se entiende a 1280×720.

## Formato de entrega
Archivos: `index.html`, `styles.css`, `app.js`, carpeta `assets/`. Al final, un resumen breve con: qué pantallas hay, atajos de teclado, cómo abrir el modo operador, y qué quedó simulado.
