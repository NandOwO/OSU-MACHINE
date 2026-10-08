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

## Video promocional (v2: replays y skins reales)
`video/promo.html` dibuja la animación en un canvas, de forma determinista (`renderAt(t)`), usando:
- el **gameplay real** de una replay `.osr` sobre su mapa (objetos, sliders y juicios salen del simulador de `src/sim`), con tres skins `.osk` que se alternan;
- **dos replays más** (sin mapa) como fondo y para las tarjetas de resultados;
- la canción del mapa, recortada para quedar sincronizada con la replay, más efectos sintetizados.

Los archivos de terceros viven en `video/private/` (ignorado por git):

```
private/data.json         # tools/video-data.ts a partir de los .osu/.osr
private/skins/            # python3 -I prep_skins.py private/skins id=ruta.osk ...
private/bg/deneb.jpg      # fondo del mapa
private/deneb-audio.mp3   # audio del mapa (si falta, el video sale con un pulso sintético)
```

Pasos:

```
npm install                                   # una vez, en la raíz
npx tsx tools/video-data.ts kimi.osr shiori.osr 36
cd prototipo/video && ./build.sh /ruta/de/trabajo /ruta/poipiu-promo.mp4
```

`audio.py` mezcla la canción y los efectos; `build.sh` renderiza los cuadros con Chromium y los une con ffmpeg.
La fuente `Press Start 2P` (licencia OFL) va en `video/assets/`. El `.mp4` no se guarda en git.

> **Derechos.** La canción, el fondo y las skins son de terceros. El video con esos materiales es para uso privado o educativo; para publicarlo, hay que tener permiso de sus autores.
