# Prototipo POIPIU

| Archivo | Para qué |
|---|---|
| `PROMPT.md` | Prompt completo para generar el prototipo navegable (pensado para Google Stitch u otra herramienta) |
| `logo/poipiu-logo.svg` | Logo horizontal, fondo transparente |
| `logo/poipiu-logo-dark.svg` | Logo horizontal sobre fondo oscuro |
| `logo/poipiu-icon.svg` | Ícono cuadrado (favicon, app, miniatura) |
| `tokens.css` | Colores, tipografías y tiempos de animación |
| `storyboard-promo.md` | Guion de 40 s del video promocional |
| `video/` | Fuente del video promocional (se renderiza a `.mp4`) |

## Uso con Stitch
1. Pegar `PROMPT.md` como indicación principal.
2. Subir `logo/poipiu-logo.svg` (o su PNG) y los colores de `tokens.css` como referencia.
3. Pedir las pantallas de a una o dos para no perder detalle (Attract, Skin, Mapa, Juego, Resultados, Ranking, Canje).

## Video promocional (v3, 80 s: una sesión completa en la máquina)
`video/promo.html` dibuja la animación en un canvas, de forma determinista (`renderAt(t)`). Muestra una sesión continua: tarjeta, elección de skin y mapa, **tres gameplays reales** (uno por mapa, con una skin distinta cada uno), resultados con tickets, ranking (la máquina entra como **POIPIU**), canje del Funko y llamada final. Todo usa datos reales:

- el gameplay sale de replays `.osr` jugadas sobre su mapa (objetos, sliders y juicios del simulador de `src/sim`);
- los resultados, los tickets (fórmula de `DISEÑO.md` §4.1) y los contadores de la marquesina salen de esas mismas replays;
- la música de cada tramo es la canción del mapa, cortada donde empieza la replay para que coincida, más el hitsound del propio mapa en cada golpe; los menús llevan una base sintetizada.

Los archivos de terceros viven en `video/private/` (ignorado por git):

```
private/data.json           # npx tsx tools/video-data.ts   (usa fixtures/private/*.osu y *.osr)
private/skins/              # python3 -I prep_skins.py private/skins id=ruta.osk ...   (ids: whitecat, azerite, btmc)
private/bg/<mapa>.jpg       # fondo de cada mapa (deneb, kimi, shiori)
private/<mapa>-audio.mp3    # canción de cada mapa
private/<mapa>-hit.wav      # hitsound de cada mapa
```

Pasos:

```
npm install                                   # una vez, en la raíz
npx tsx tools/video-data.ts                   # elige solo la mejor ventana de 12 s de cada replay
cd prototipo/video && ./build.sh /ruta/de/trabajo /ruta/poipiu-promo.mp4
```

`audio.py` mezcla canciones, hitsounds y efectos; `build.sh` renderiza los cuadros con Chromium (4 procesos) y los une con ffmpeg. La fuente `Press Start 2P` (licencia OFL) va en `video/assets/`. El `.mp4` no se guarda en git.

> **Derechos.** Las canciones, fondos, hitsounds y skins son de terceros. El video con esos materiales es para uso privado o educativo; para publicarlo hace falta permiso de sus autores.
