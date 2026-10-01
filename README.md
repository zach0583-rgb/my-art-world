# my-art-world

Six connected, walkable 3D worlds inspired by the Pacific Northwest — mossy rainforest, foggy old growth, a fern creek, an alpine sunset lake, a wildflower meadow, and a crater‑lake rim — with a talking AI guide and COD‑Mobile‑style controls.

100% free and open source: [A-Frame](https://aframe.io)/Three.js for the worlds (vendored, works offline), [Ollama](https://ollama.com) + Gemma for the guide's brain, the browser's built‑in speech for voice. Runs in Chrome on a **Galaxy Note 10**, on desktop, and on **USB‑C AR / neckband glasses**.

## Play it

Open `index.html` from GitHub Pages, or locally:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

### Controls (COD Mobile layout)

| | Phone | Desktop | Gamepad |
|---|---|---|---|
| Move | **left thumb** – touch anywhere on the left half, a stick appears | WASD / arrows | left stick |
| Look | **right thumb** – drag on the right half | drag mouse | right stick |
| Sprint | **RUN** button (toggle) or push stick fully forward | Shift | L3 |
| Jump | **JUMP** | Space | A |
| Talk / interact | **TALK** (big button) or tap the guide | E / click guide | RT |
| Map | 🗺 | M | — |
| Glasses 3D | 👓 | 3 | — |

Walk into any glowing ring to travel to the neighbouring world.

### World map

```
   Wildflower Meadow ── Crater Rim
          │                │
      Mistwood ────── Alpine Lake
          │                │
     Moss Grove ───── Fern Brook
```

Deep‑link to any world with `#mossgrove`, `#fernbrook`, `#mistwood`, `#alpinelake`, `#meadow`, `#craterlake`.

## AR glasses ("neckband" / USB‑C glasses)

1. Plug the glasses into the Note 10 (or a PC).
2. Press **👓** (or key `3`). The page goes full‑screen landscape and renders a left/right eye pair.
3. Put the glasses in **3D / SBS (side‑by‑side)** mode. If depth looks inverted, tick *Swap left/right eye* in ⚙.

Glasses that support WebXR directly can use the **VR** button instead.

## The AI guide (free, private, offline‑capable)

The painted spirit travels with you and knows which world you're in. Her brain is a free local LLM:

```bash
# on your desktop — install Ollama from https://ollama.com (free, open source)
ollama pull gemma3:4b                    # or gemma3:1b on a weak PC
# start it so the phone on your Wi‑Fi can reach it
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve          # Mac / Linux
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve   # Windows PowerShell
```

Find the desktop's LAN IP (`ipconfig` / `ip a`), open **⚙** in the world, enter `http://192.168.x.x:11434`, press **Test AI connection**, Close. Or open the page with `?ollama=http://192.168.x.x:11434`.

> **https vs http:** the mic needs an https page (GitHub Pages) while Ollama is plain http. On the phone: Chrome → tap the lock icon → *Site settings* → *Insecure content* → **Allow**. Alternatively serve the page over http from your desktop and use 💬 text chat.

**Astra‑style camera assistant on the phone itself:** install the free open‑source **Google AI Edge Gallery** (Play Store / `github.com/google-ai-edge/gallery`) with the Gemma E2B model. It's a separate app, but the best free on‑device option for a Note 10.

Without a server the guide still speaks built‑in lines for each world.

## Performance

⚙ → *Graphics quality*. Phones default to **Low** (fewer plants/trees, no shadows), desktops to **High**. If the Note 10 stutters, close other tabs and stay on Low.

## Files

- `index.html` – scene + HUD
- `worlds.js` – the six world definitions (sky, textures, fog, lighting, scenery counts, portals, guide line). **Add a world here.**
- `world.js` – engine: world builder, portals & travel, COD‑style controls, glasses SBS mode
- `guide.js` – AI guide: Ollama client, speech in/out, chat, settings
- `ui.css` – HUD styling
- `assets/sky/*.jpg` – 360° equirectangular sky domes, one per world (generated from your reference photos)
- `assets/tex/*` – tileable moss / bark / leaf‑litter / grass / rock textures, fern & tree sprites
- `vendor/aframe.min.js` – A‑Frame 1.6.0 (local copy, no CDN needed)
- `test-char.png` – the guide sprite (black background, rendered additively)

### Adding a world

1. Drop a 2:1 equirectangular panorama in `assets/sky/`.
2. Add an entry to `worlds.js` (copy an existing one), set `portals` to link it from an edge (`N/S/E/W`) of a neighbour, and add the reverse link on the neighbour.
3. Add a button to the map in `index.html`.
