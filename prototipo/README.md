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

## Video promocional
`video/promo.html` dibuja la animación en un canvas, de forma determinista (`renderAt(t)`). `video/audio.py` sintetiza una banda sonora original. `video/build.sh` renderiza los cuadros con Chromium y los une con ffmpeg:

```
cd prototipo/video
npm install            # en la raíz del repositorio, una vez
./build.sh /ruta/de/trabajo /ruta/poipiu-promo.mp4
```

La fuente tipográfica `Press Start 2P` (licencia OFL) va en `video/assets/`. El `.mp4` no se guarda en git.
