# Opcion B: osu! real como juego (rama `claude/osu-nativo`)

Estado: **diseno para validar**, sin codigo todavia. La opcion A (motor propio, rama `claude/magical-davinci-vkds44`) sigue intacta.

## 1. Idea en una frase

La maquina POIPIU (monedas, tarjeta, tutorial, jugadas, tickets, ranking, premios) se queda como esta. Lo unico que cambia es **quien juega la partida**:
en vez de nuestro motor, juega **osu!stable** y un puente lee el resultado con **tosu** para calcular los tickets con la misma formula.

```
                      +--------------------------- POIPIU (Electron) ----------------------------+
 moneda / tarjeta --> | KioskMachine (sin cambios)                                                |
 (simulados)          |   idle > credited > tutorial > skin > [PARTIDA] > results > name > ranking |
                      |                                        ^   |                              |
                      |                              PlaySource|   | PlayOutcome                  |
                      +----------------------------------------|---|------------------------------+
                                                               |   v
                                  +---------- motor propio (opcion A) ----------+
                                  +---------- TosuSource (opcion B) ------------+  <- WebSocket
                                                               ^
                                                      tosu (lee memoria)  <---  osu!stable (juego real)
```

La costura ya existe en el codigo: `KioskMachine.startPlay()` consume una jugada y `KioskMachine.finishPlay(PlayOutcome)` recibe
`{ mapKey, objects, score, maxScore, accuracy, maxCombo, n300, n100, n50, miss, skin, failed }`.
La opcion B solo tiene que **producir ese mismo `PlayOutcome`** desde osu! real.

## 2. Como se ve en la "simulacion de maquina" (lo que hay que definir primero)

La simulacion de maquina es una sola PC con tres piezas:

| Pieza | Que es | Quien la maneja |
|---|---|---|
| **POIPIU shell** | Ventana Electron a pantalla completa con la interfaz de arcade; moneda/tarjeta simuladas (teclas C, T, Y) | nosotros |
| **osu!stable** | El juego real, en pantalla completa sin bordes, carpeta `Songs` solo con los mapas de la maquina | osu! |
| **tosu** | Programa que lee la memoria de osu! y emite estado/puntaje por WebSocket local | tercero (abierto) |

Flujo de una sesion:

1. **idle**: shell con el video promocional / modo demo. (La demo con gameplay ya no es nuestro motor: se usa el video pregrabado.)
2. **moneda o tarjeta**: igual que hoy. Se acreditan 3 jugadas.
3. **tutorial**: pantallas del shell (puede ser el video + texto; el tutorial interactivo con nuestro motor se conserva si se quiere).
4. **skin**: el shell muestra las skins instaladas y **escribe la elegida en la config de osu!** (`Skin = ...` en `osu!.<usuario>.cfg`) **antes de lanzar/relanzar osu!**.
5. **mapa**: se elige en el **song select de osu!** (solo existen los mapas de la maquina). El shell queda detras y espera.
6. **partida**: tosu avisa `play` -> el puente llama `machine.startPlay()` (descuenta jugada). Reintentar o cambiar de mapa y volver a jugar = otra jugada, como ya esta definido.
7. **fin**: tosu avisa `resultScreen` (o `fail`) -> el puente arma el `PlayOutcome` -> `machine.finishPlay()` -> el shell se pone al frente con tickets/ranking/nombre.
8. **jugadas agotadas o 2 min de inactividad**: el shell cierra/oculta osu! y vuelve a idle.

Esto es una **simulacion** de hardware igual que en la opcion A: moneda y tarjeta siguen siendo teclas con animacion.

## 3. Puente con tosu (`PlaySource`)

Interfaz comun (nueva, para que A y B convivan):

```ts
interface PlaySource {
  onPlayStart(cb: (info: { mapKey: string; objects: number; maxScore: number; skin?: string }) => void): void;
  onPlayEnd(cb: (outcome: PlayOutcome) => void): void;
  onAbandon(cb: () => void): void;      // salio a mitad de la cancion
  dispose(): void;
}
```

Implementaciones:

- `EngineSource` — el motor actual (opcion A).
- `TosuSource` — cliente WebSocket de tosu (`ws://127.0.0.1:24050/...`; **la ruta y los nombres de campos exactos se confirman al integrar con tosu real**).
- `MockTosuServer` — **servidor falso que habla como tosu** y reproduce partidas con nuestro motor (autoplay o replays `.osr`).
  Sirve para ver y probar toda la maquina **sin tener osu! instalado** y para los tests automaticos. `TosuSource` no distingue si habla con el real o con el falso.

### Mapeo tosu -> PlayOutcome

| tosu | PlayOutcome |
|---|---|
| estado `play` (inicio) | `startPlay()` |
| ruta/archivo del beatmap | se parsea el `.osu` con nuestro parser -> `mapKey` (hash), `objects`, `maxScore = maxScoreV1(map)` |
| `score`, `combo.max`, `hits` 300/100/50/miss | `score`, `maxCombo`, `n300`, `n100`, `n50`, `miss` |
| `accuracy` | `accuracy` |
| hp llega a 0 / grade F / estado `resultScreen` con fallo | `failed = true` (no tickets, no ranking, igual consume jugada) |
| estado vuelve a `songSelect`/`menu` sin llegar al resultado | `abandon` (consume jugada, sin tickets) |

La formula de tickets **no cambia**: `round(100 * r^2)`, `r = score / maxScoreV1(map)`, minimo 50 objetos, requiere tarjeta.

## 4. Reglas anti-trampa

- **Mods**: lista permitida configurable. Por defecto solo **NoMod** (si no, `maxScore` y la comparacion en el ranking dejan de ser justos).
  Mods prohibidos siempre: Auto, Relax, Autopilot, Cinema, NoFail, SpunOut, y cualquier mod de velocidad. Partida con mod prohibido = **0 tickets y no entra al ranking** (igual consume jugada).
- **Verificacion cruzada (opcional, recomendada)**: osu!stable guarda el `.osr` de cada partida en `Replays/`. El puente lo lee y lo pasa por **nuestro simulador de replays** ya validado; si el puntaje difiere mucho del que dijo tosu, se marca como sospechoso y no paga.
- **Mapas**: `mapKey` por hash del `.osu`; si el archivo no esta en la lista de mapas de la maquina, no paga.

## 5. Bloqueo de la maquina (lo mas fragil)

osu! no esta hecho para kioscos. El shell actua de **vigilante**:

- lanza osu! y tosu, y los relanza si se caen;
- si osu! sale de song select/partida sin motivo, o se acaban las jugadas, lo cierra o lo oculta;
- la config de osu! (`osu!.<usuario>.cfg`) se deja fija: pantalla completa, sin video/storyboard si se quiere, volumen, `Skin`;
- Windows: ocultar barra de tareas, deshabilitar atajos (Assigned Access / politica de grupo; script en `scripts/windows/`).

Limites que hay que asumir: un jugador puede abrir el menu de opciones de osu! o importar archivos; no podemos impedir todo desde fuera.
Mitigacion: el vigilante solo paga tickets si se cumplen las reglas del punto 4, y se puede relanzar osu! entre sesiones.

## 6. Importar mapas y skins (jugador)

- El boton IMPORTAR del shell **copia** el `.osz` a la carpeta `Songs` de osu! (o lo abre con osu!, que lo importa solo) y la `.osk` a `Skins`.
- Los mapas importados por el cliente quedan disponibles en el song select de osu! directamente.

## 7. Que NO hace la opcion B

- No muestra el HUD de POIPIU durante la partida (osu! dibuja su propia interfaz). Un overlay transparente encima es posible con osu! en ventana sin bordes; se deja para una fase posterior.
- No controla el song select (es el de osu!).
- No se puede probar aqui con osu! real: este entorno es Linux sin osu!. Lo que se verifica aqui es el puente contra `MockTosuServer`; **la prueba con osu! y tosu reales la haces tu en Windows**.

## 8. Licencias y reglas

- osu!stable **no se redistribuye**: cada maquina lo descarga de osu.ppy.sh. El paquete de POIPIU no lo incluye.
- tosu es de codigo abierto y solo **lee** la memoria (herramienta comun para overlays); su uso con cuenta oficial puede tener reglas del juego, por lo que se recomienda **modo offline / sin cuenta** en la maquina.
- Las marcas osu! pertenecen a sus duenos; para un proyecto academico basta con indicarlo.

## 9. Hitos

| # | Entrega | Estado |
|---|---|---|
| B1 | `OsuSnapshot`/`SnapshotFeed` como costura entre osu! y la maquina (`src/osu/types.ts`); el motor propio sigue igual | hecho |
| B2 | `OsuBridge` (inicio, fin, fallo, abandono, reintento, violacion), adaptador `tosu.ts`, `MockTosuServer` WebSocket, simulador de partidas, modo `?source=mock` en el shell | hecho, con tests y e2e |
| B3 | Mods (solo NoMod), verificacion con `.osr` usando nuestro simulador (tolerancia 3 %) | hecho; probado con un replay real local |
| B4 | Vigilante (`electron/osuHost.mjs`): lanza y relanza osu! y tosu, instala mapas (`Songs/`) y skins (`Skins/`) de la maquina, escribe `Skin` en la config, busca el `.osr` en `Replays/`, cierra osu! al terminar la sesion o ante una violacion; `-Source tosu` en el instalador del kiosco | hecho; probado con un osu! falso (tests + e2e en Electron) |
| B5 | Prueba real en Windows con osu!stable + tosu; confirmar nombres de campos en `src/osu/tosu.ts` | pendiente (requiere osu! real) |
| B6 | Overlay transparente con HUD de tickets (opcional) | no empezado |

## 10. Decisiones tomadas

1. **Mods**: solo NoMod. Lista ampliable por el operador, salvo Auto/Relax/Autopilot/Cinema/NoFail/SpunOut y mods de velocidad, que nunca pagan.
2. **Verificacion con `.osr`**: activada (modo `strict`): una partida sin replay o cuyo puntaje no coincide (mas del 3 %) no paga ni entra al ranking, pero gasta la jugada.
3. **Tutorial**: video + texto (3 pasos) en vez del interactivo; el video es `promo.mp4` junto a la pagina, opcional (si no existe se ve solo el texto).
4. **Mapa**: se elige en el song select de osu!.

## 11. Como probarlo

- Simulacion en el navegador, sin osu!: abrir con `?source=mock` (por ejemplo `npm run dev` y `http://localhost:5173/?source=mock`). En la pantalla "JUEGA EN OSU!" hay un panel con partidas guiadas: completar, jugar mal, perder vida, salir a medias, reintentar y con mods.
- Con osu! y tosu reales (Windows): abrir con `?source=tosu`; el shell escucha `ws://127.0.0.1:24050/websocket/v2`.
- Tests: `npm test` (incluye puente, mods, adaptador, servidor WebSocket falso y, si existen los fixtures privados, verificacion de un replay real).
- e2e del shell con la simulacion: `node tools/e2e-osu-mock.mjs <mapa.osz>` tras `npx vite build`.

## 12. Puesta en marcha en Windows (osu! y tosu reales)

1. Instalar **osu!stable** (osu.ppy.sh) y **tosu** (github.com/KotRikD/tosu/releases). Abrir osu! una vez para que cree su carpeta y su archivo `osu!.<usuario>.cfg`.
   Recomendado: jugar **sin iniciar sesion** y en pantalla completa; ajustar volumen y desactivar video/storyboard en las opciones de osu!.
2. Crear `%APPDATA%\POIPIU\osu.json` (hay un ejemplo en `docs/osu.json.example`) con las rutas de osu! y tosu. Sin ese archivo la opcion B esta apagada.
3. Instalar POIPIU y registrar el kiosco con el origen osu!:
   `powershell -ExecutionPolicy Bypass -File instalar-kiosco.ps1 -ExePath "C:\POIPIU\POIPIU.exe" -Source tosu`
   (o abrir `POIPIU.exe --source=tosu` a mano para probar).
4. Los mapas y skins de POIPIU (carpeta de contenido, mas lo que importen los jugadores) se copian solos a `Songs\` y `Skins\` de osu! cada vez que se elige skin; osu! se reinicia entonces para leerlos.
5. Cuando algo no cuadre con tosu real, los nombres de campos estan en `src/osu/tosu.ts` (funcion `normalizeTosu`); es lo primero que hay que contrastar.

Notas: osu! se reinicia en cada sesion (tarda unos segundos, el shell muestra "PREPARANDO OSU!..."). El vigilante lo relanza si se cae durante la sesion y lo cierra al terminar o si se juega sin jugadas.
