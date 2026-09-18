/* The in-world AI guide.
 * - Brain: a free, local Ollama server (Gemma / Llama / etc.) reachable over your Wi-Fi.
 * - Ears/voice: the browser's built-in Web Speech API (free, works in Chrome on Android + desktop).
 * - Fallback: if no server can be reached, the guide answers with built-in lines so the world never feels dead.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  const settings = {
    url: params.get('ollama') || localStorage.getItem('ollamaUrl') || '',
    model: params.get('model') || localStorage.getItem('ollamaModel') || 'gemma3:4b',
    voice: localStorage.getItem('guideVoice') !== '0',
    save() {
      localStorage.setItem('ollamaUrl', this.url);
      localStorage.setItem('ollamaModel', this.model);
      localStorage.setItem('guideVoice', this.voice ? '1' : '0');
    }
  };

  const SYSTEM_PROMPT =
    'You are the Guide, a luminous painted spirit who lives in a dark, misty forest inside an artist\'s 3D world. ' +
    'At the end of the forest path floats a huge glowing painting of a sunset in orange, gold, magenta and violet over black water. ' +
    'Speak warmly, a little mysterious, and keep every answer to one or two short sentences because you are spoken aloud. ' +
    'You may talk about the art, the forest, the fireflies, or anything the visitor asks.';

  const FALLBACK = [
    'Welcome, traveller. Follow the path; the painting at its end remembers every sunset it has ever seen.',
    'The fireflies are shy, but they like it when you stand still.',
    'I am only painted light, yet I have been waiting for you a long time.',
    'Connect me to your desktop\'s Ollama server and I can truly think. For now, I can only dream aloud.',
    'Every tree here grew from a brushstroke.',
    'Ask me about the colours; I know their names better than my own.'
  ];
  let fallbackIdx = 0;

  const history = [];
  const log = $('chat-log');
  const bubble = $('guide-bubble');
  const bubbleText = $('guide-bubble-text');
  let bubbleTimer;

  function addLine(cls, text) {
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function showBubble(text) {
    bubbleText.setAttribute('value', text);
    bubble.setAttribute('visible', true);
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.setAttribute('visible', false), Math.min(12000, 3000 + text.length * 60));
  }

  /* ---------- voice out (free, built into the browser) ---------- */
  function speak(text) {
    if (!settings.voice || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const pick = voices.find(v => /en/i.test(v.lang) && /female|zira|samantha|karen|google uk english female/i.test(v.name))
      || voices.find(v => /en/i.test(v.lang));
    if (pick) u.voice = pick;
    u.rate = 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
  }

  /* ---------- brain ---------- */
  async function askOllama(text) {
    const base = settings.url.replace(/\/$/, '');
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...history.slice(-10), { role: 'user', content: text }];
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(base + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.model, messages, stream: false, options: { num_predict: 120, temperature: 0.8 } }),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return (data.message && data.message.content || '').trim();
    } finally { clearTimeout(to); }
  }

  let busy = false;
  async function ask(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    addLine('me', text);
    showBubble('…');
    let reply = '';
    if (settings.url) {
      try { reply = await askOllama(text); }
      catch (e) { addLine('sys', 'Could not reach the AI server (' + e.message + '). Using built-in lines. Check ⚙ settings.'); }
    }
    if (!reply) { reply = FALLBACK[fallbackIdx++ % FALLBACK.length]; }
    history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    addLine('guide', reply);
    showBubble(reply);
    speak(reply);
    busy = false;
  }
  window.askGuide = ask;

  /* ---------- voice in (free, built into Chrome) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  function listen() {
    if (!SR) { UI.status('Voice input needs Chrome. Use 💬 Chat instead.'); $('chat').classList.remove('hidden'); return; }
    if (listening) { rec && rec.stop(); return; }
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onstart = () => { listening = true; $('btn-talk').classList.add('active'); UI.status('Listening…', 4000); showBubble('(listening)'); };
    rec.onresult = (e) => { const t = e.results[0][0].transcript; ask(t); };
    rec.onerror = (e) => { UI.status('Mic: ' + e.error); };
    rec.onend = () => { listening = false; $('btn-talk').classList.remove('active'); };
    try { rec.start(); } catch (e) { UI.status('Mic unavailable: ' + e.message); }
  }

  /* ---------- wiring ---------- */
  $('btn-talk').addEventListener('click', listen);
  $('btn-chat').addEventListener('click', () => { $('chat').classList.toggle('hidden'); if (!$('chat').classList.contains('hidden')) $('chat-input').focus(); });
  $('chat-form').addEventListener('submit', (e) => { e.preventDefault(); const v = $('chat-input').value; $('chat-input').value = ''; ask(v); });

  // tap / gaze / VR-controller click on the guide → listen (or open chat when no mic)
  document.querySelectorAll('#guide .clickable').forEach(el => el.addEventListener('click', () => listen()));

  // settings
  const sUrl = $('set-url'), sModel = $('set-model'), sVoice = $('set-voice'), sSwap = $('set-swap');
  function openSettings() {
    sUrl.value = settings.url; sModel.value = settings.model; sVoice.checked = settings.voice;
    sSwap.checked = localStorage.getItem('sbsSwap') === '1';
    $('settings').classList.remove('hidden');
  }
  function closeSettings() {
    settings.url = sUrl.value.trim(); settings.model = sModel.value.trim() || 'gemma3:4b'; settings.voice = sVoice.checked; settings.save();
    const sbs = document.querySelector('a-scene').components['sbs-glasses'];
    if (sbs) sbs.setSwap(sSwap.checked);
    $('settings').classList.add('hidden');
  }
  $('btn-settings').addEventListener('click', openSettings);
  $('set-close').addEventListener('click', closeSettings);
  $('set-test').addEventListener('click', async () => {
    const url = sUrl.value.trim().replace(/\/$/, '');
    if (!url) { UI.status('Enter your Ollama URL first.'); return; }
    try {
      const r = await fetch(url + '/api/tags'); const d = await r.json();
      const names = (d.models || []).map(m => m.name);
      UI.status('Connected ✓ models: ' + (names.join(', ') || 'none pulled yet'), 6000);
      if (names.length && !names.includes(sModel.value.trim())) sModel.value = names[0];
    } catch (e) { UI.status('No connection: ' + e.message + ' (is OLLAMA_ORIGINS=* set?)', 6000); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 't' || e.key === 'T') listen();
    if (e.key === 'c' || e.key === 'C') $('btn-chat').click();
  });

  if (params.get('ollama')) settings.save();
  addLine('sys', settings.url ? 'AI server: ' + settings.url + ' (' + settings.model + ')' : 'No AI server set — guide uses built-in lines. Open ⚙ to connect Ollama.');
  setTimeout(() => showBubble('Hello, traveller. Tap me and speak.'), 2500);
})();
