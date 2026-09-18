# my-art-world

A walkable 3D forest built around your paintings, with a talking AI guide.
100% free and open source: [A-Frame](https://aframe.io) for the world, [Ollama](https://ollama.com) + an open model (Gemma) for the guide's brain, and the browser's built-in speech for voice.

Runs in the browser — no app to install — on a **Galaxy Note 10**, a desktop, and **AR / neckband glasses** (Xreal, Rokid, Viture, …) plugged into either.

## Play it

Open `index.html` from GitHub Pages (Settings → Pages → deploy from `main`), or locally:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
```

| Where | How to move | How to talk |
|---|---|---|
| Phone | drag to look, left joystick to walk | tap **🎙 Talk** or tap the guide |
| Desktop | WASD / arrows + mouse drag | **T** to talk, **C** for chat |
| Glasses (SBS) | phone/PC as trackpad, or a Bluetooth gamepad | tap the guide with the gaze cursor |
| WebXR headset | controllers / thumbstick | point & click the guide |

## AR glasses ("neckband" / USB‑C glasses)

1. Plug the glasses into the Note 10 (or a PC).
2. Open the page and press **👓 Glasses 3D** (or key `3`). The page goes full-screen landscape and renders a left/right eye pair.
3. On the glasses, switch to **3D / SBS (side-by-side)** mode. If depth feels inverted, tick *Swap left/right eye* in ⚙.

If your glasses support WebXR directly (e.g. through Nebula / Rokid's browser), A-Frame's own **VR** button in the bottom-right works too.

## The AI guide (free, private, offline-capable)

The guide's brain is a free local LLM. Nothing goes to the cloud.

**On your desktop (Windows / Mac / Linux):**

```bash
# 1. install Ollama from https://ollama.com  (free, open source)
ollama pull gemma3:4b                  # ~3 GB; or gemma3:1b on a weak PC, llama3.2 also works

# 2. start it so the phone on your Wi-Fi can reach it
#    Windows PowerShell:
$env:OLLAMA_HOST="0.0.0.0"; $env:OLLAMA_ORIGINS="*"; ollama serve
#    Mac / Linux:
OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve
```

Find your desktop's LAN IP (`ipconfig` / `ip a`, e.g. `192.168.1.20`), then on the phone open **⚙** in the world and enter `http://192.168.1.20:11434`, press **Test connection**, Close. Or just open the page with `?ollama=http://192.168.1.20:11434`.

> **https vs http:** the microphone only works on an https page (GitHub Pages) or on `localhost`, while Ollama is plain `http://`. On the phone, the easy fix is: open the GitHub Pages URL in Chrome → tap the lock icon → *Site settings* → *Insecure content* → **Allow**. Then both voice and the AI server work. (Alternative: open the page over `http://` from your desktop and use the 💬 text chat.)

**On the Note 10 itself (no desktop):** install the free, open-source **Google AI Edge Gallery** (Play Store or `github.com/google-ai-edge/gallery`) with the Gemma *E2B* model for an Astra-style camera + voice assistant. It runs fully on-device; it isn't wired into this page (Android can't expose a local HTTP server to the browser easily), but it's the best free Astra-like experience on that phone.

Without a server the guide still replies with built-in lines, so the world always works.

## Files

- `index.html` – the scene + UI
- `world.js` – procedural forest, fireflies, touch joystick, side-by-side stereo for glasses
- `guide.js` – AI guide: Ollama client, speech in/out, chat panel, settings
- `ui.css` – overlay styling
- `test-bg.png` – your painting (the sky at the end of the path)
- `test-char.png` – the guide sprite (black background, rendered additively so it glows)

Replace `test-bg.png` / `test-char.png` with your own art any time — keep the character on a black background.
