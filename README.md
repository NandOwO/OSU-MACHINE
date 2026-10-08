# POIPIU

Máquina arcade de ritmo, réplica del modo **osu!standard** (el de cursor). Proyecto académico: el cobro, la tarjeta y los tickets son **simulados**.

Se juega con mouse (o `Z` / `X`). Lee mapas `.osz` y skins `.osk` de osu!. Tiene reposo con demostración, tutorial, selección de skin y mapa con vista previa, barra de vida, resultados, ranking top 50 con nombre, tickets en tarjeta y canje de premios.

## Probarlo

```
npm install
npm run dev            # abre http://localhost:5173
```

O como aplicación de escritorio a pantalla completa: `npm run electron`. Para Windows, ver `docs/WINDOWS.md`.

## Agregar mapas y skins

No se incluye ningún mapa (son de sus autores): los importas tú.

1. **Botón `IMPORTAR MAPAS / SKIN`** (abajo a la derecha, siempre visible) → elegir archivos.
2. O **arrastra** los archivos `.osz` / `.osk` a la ventana, desde cualquier pantalla.
3. En las pantallas de skin y de mapa hay además un botón de importar propio.

Un `.osz` trae uno o varios mapas (y a veces su skin). Un `.osk` es solo una skin. Lo importado queda guardado para la próxima vez y se puede quitar desde el mismo diálogo. Los mapas se descargan de https://osu.ppy.sh/beatmapsets.

## Jugar

| Tecla | Acción |
|---|---|
| `C` | insertar moneda (3 jugadas) |
| `T` | pasar la tarjeta (`Y` cambia de tarjeta, `Shift+T` crea una nueva) |
| `Z` / `X` o clic | golpear |
| `Ctrl+Shift+O` | panel de operador: reglas, premios, tarjetas, rankings |
| `Ctrl+Shift+Q` | salir (solo en la app de escritorio) |

## Documentación
- `DISEÑO.md`: diseño del producto y fórmulas (puntaje, tickets, validación con replays reales).
- `DESARROLLO.md`: arquitectura, pruebas y estado.
- `docs/WINDOWS.md`: paquete e instalación en Windows.
- `prototipo/`: logo, paleta, prompt de prototipo y video promocional.

`npm test` corre las pruebas; `npm run typecheck` revisa los tipos.
