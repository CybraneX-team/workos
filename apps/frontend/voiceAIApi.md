# Gemini Live API — Integration Reference

A complete reference for building real-time bidirectional audio applications
with the Google Gemini Live API. Distilled from production usage.

---

## What it is

Gemini Live is a WebSocket-based streaming API that supports real-time
bidirectional audio (and optionally video) conversations with a Gemini model.
Think of it as a low-latency voice assistant session — mic audio streams in,
model audio streams back, and the model can invoke tools mid-conversation.

---

## Endpoints

### API key auth (REST-style, easier to set up)
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=YOUR_API_KEY
```

### Ephemeral token auth (recommended for browser clients)
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=TOKEN
```

**Use the `v1alpha` endpoint with `BidiGenerateContentConstrained` when using
ephemeral tokens.** The `v1beta` endpoint is for API-key auth only.

---

## Models

| Model ID | Notes |
|----------|-------|
| `gemini-3.1-flash-live-preview` | Primary Live model (used in production) |
| `gemini-2.0-flash-live-preview` | Alternative |

Refer to the model as `models/gemini-3.1-flash-live-preview` in setup messages.

---

## Session limits

| Mode | Max duration |
|------|-------------|
| Audio only | 15 minutes |
| Audio + video | 2 minutes |

Google's default token `expireTime` is 30 min. Set it explicitly if you need
a different window. After the limit the server closes the connection cleanly.

---

## Audio specs

| Direction | Format | Sample rate | Channels | Encoding |
|-----------|--------|-------------|----------|----------|
| Input (mic → model) | PCM16, little-endian | 16 kHz | Mono | base64 |
| Output (model → speaker) | PCM16, little-endian | 24 kHz | Mono | base64 |

MIME type string to use in messages: `audio/pcm;rate=16000`

---

## Available voices

`Aoede` · `Charon` · `Fenrir` · `Kore` · `Puck`

Set in the `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` field of
the session config (see Setup section below).

---

## Security: ephemeral tokens (recommended for browsers)

**Never ship `GEMINI_API_KEY` in a browser bundle.** The recommended pattern:

1. Server holds `GEMINI_API_KEY` in an env var (never sent to client).
2. Authenticated client calls `POST /api/gemini/token` on your backend.
3. Server mints a one-use ephemeral token via `ai.authTokens.create()`.
4. Token is returned to the browser (valid for ~60 s to open the socket).
5. Browser connects directly to Gemini using `?access_token=TOKEN`.

**Security properties of ephemeral tokens:**
- `uses: 1` — single-use, cannot be reused after connection is opened.
- `expireTime` — token expires before the browser can abuse it.
- `liveConnectConstraints` — system instruction and tool declarations are
  **locked into the token at mint time**. The browser cannot override them.
  This prevents prompt injection from malicious clients.

### Token mint (Node.js / Express, using `@google/genai` SDK)

```typescript
import { GoogleGenAI, Type, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const expireTime = new Date(Date.now() + 30 * 60_000).toISOString();

const tokenResponse = await ai.authTokens.create({
  config: {
    uses: 1,
    expireTime,
    newSessionExpireTime: expireTime,
    liveConnectConstraints: {
      model: 'models/gemini-3.1-flash-live-preview',
      config: {
        systemInstruction: {
          parts: [{ text: 'You are a helpful voice assistant. Keep responses under 3 sentences.' }],
        },
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
        },
        tools: [], // see Tool Calling section
      },
    },
    httpOptions: { apiVersion: 'v1alpha' },
  },
});

// tokenResponse.name is the ephemeral access token
const token = tokenResponse.name; // e.g. "auth_tokens/xxxxx"
```

---

## Message flow

```
Client                                    Gemini Server
  │                                            │
  │── WebSocket open ──────────────────────────►│
  │── setup { model: "models/..." } ──────────►│
  │◄── setupComplete ──────────────────────────│
  │                                            │
  │── realtimeInput.audio { data, mimeType } ─►│  (repeating)
  │── realtimeInput.audio { data, mimeType } ─►│
  │                                            │
  │◄── serverContent.modelTurn (audio chunks) ─│  (repeating)
  │◄── serverContent.turnComplete ─────────────│
  │                                            │
  │── realtimeInput.audio ... ────────────────►│
```

### Setup message
```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview"
  }
}
```

When using **ephemeral tokens** (`BidiGenerateContentConstrained`), the system
instruction, tools, and speech config are already in the token — the `setup`
message only needs the model name.

When using **API key** (`BidiGenerateContent`), include the full config in setup:
```json
{
  "setup": {
    "model": "models/gemini-3.1-flash-live-preview",
    "systemInstruction": {
      "parts": [{ "text": "You are a helpful assistant." }]
    },
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": { "voiceName": "Puck" }
        }
      }
    }
  }
}
```

### Sending audio (client → model)
```json
{
  "realtimeInput": {
    "audio": {
      "data": "<base64-encoded PCM16 @ 16kHz>",
      "mimeType": "audio/pcm;rate=16000"
    }
  }
}
```

**Deprecated (do not use):** `realtimeInput.mediaChunks` — removed in 2025,
server closes with code 1007 if you use it.

### Receiving audio (model → client)
```json
{
  "serverContent": {
    "modelTurn": {
      "parts": [
        {
          "inlineData": {
            "mimeType": "audio/pcm;rate=24000",
            "data": "<base64-encoded PCM16 @ 24kHz>"
          }
        }
      ]
    },
    "turnComplete": true
  }
}
```

Multiple chunks arrive before `turnComplete`. Buffer and play them gaplessly.

### Sending text mid-session (context updates)
```json
{
  "clientContent": {
    "turns": [
      {
        "role": "user",
        "parts": [{ "text": "User has navigated to the Finance section." }]
      }
    ],
    "turnComplete": true
  }
}
```

Useful for injecting context (page changes, navigation events) without
restarting the session.

### Interrupting the model
When the user speaks while the model is speaking, send any `realtimeInput.audio`
chunk. The server will respond with `serverContent.interrupted: true`. On
receiving this, reset your playback queue (`nextPlayTime = audioCtx.currentTime`).

---

## Tool calling

### Declare tools at token-mint time (ephemeral token flow)
```typescript
import { Type } from '@google/genai';

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'navigate_to',
        description: 'Navigate to a specific section of the app.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            section: {
              type: Type.STRING,
              description: 'Name of the section to navigate to.',
            },
          },
          required: ['section'],
        },
      },
    ],
  },
];
```

### Tool call from model → client
```json
{
  "toolCall": {
    "functionCalls": [
      {
        "id": "call_abc123",
        "name": "navigate_to",
        "args": { "section": "Finance" }
      }
    ]
  }
}
```

### Tool response from client → model
```json
{
  "toolResponse": {
    "functionResponses": [
      {
        "id": "call_abc123",
        "response": {
          "output": { "success": true }
        }
      }
    ]
  }
}
```

Always respond to every tool call — the model waits for the response before
continuing.

---

## Browser audio pipeline

### Input (mic → 16 kHz PCM16 → base64)

```typescript
// Request mic
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, noiseSuppression: true },
});

// Create AudioContext at 16 kHz if supported; fall back to native rate
let inputCtx: AudioContext;
try { inputCtx = new AudioContext({ sampleRate: 16000 }); }
catch { inputCtx = new AudioContext(); }

const resampleRatio = inputCtx.sampleRate / 16000;

const micSrc = inputCtx.createMediaStreamSource(stream);
const scriptNode = inputCtx.createScriptProcessor(4096, 1, 1);

scriptNode.onaudioprocess = (e) => {
  const f32 = e.inputBuffer.getChannelData(0);
  const outLen = Math.floor(f32.length / resampleRatio);
  const pcm16 = new Int16Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const idx = Math.min(Math.round(i * resampleRatio), f32.length - 1);
    pcm16[i] = Math.max(-32768, Math.min(32767, f32[idx] * 32767));
  }

  const bytes = new Uint8Array(pcm16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);

  ws.send(JSON.stringify({
    realtimeInput: {
      audio: { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' },
    },
  }));
};

// Connect: mic → analyser → scriptNode → muted destination (no feedback)
const muteGain = inputCtx.createGain();
muteGain.gain.value = 0;
micSrc.connect(scriptNode);
scriptNode.connect(muteGain);
muteGain.connect(inputCtx.destination);
```

> **Note:** `ScriptProcessorNode` is deprecated in favor of `AudioWorklet`.
> It still works universally. Migration to `AudioWorklet` requires a separate
> worklet file or an inline Blob URL.

### Output (base64 PCM16 @ 24 kHz → gapless playback)

```typescript
const playCtx = new AudioContext({ sampleRate: 24000 });
let nextPlayTime = playCtx.currentTime;

function enqueueAudio(b64: string) {
  const raw = atob(b64);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);

  const i16 = new Int16Array(u8.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;

  const buf = playCtx.createBuffer(1, f32.length, 24000);
  buf.copyToChannel(f32, 0);

  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);

  const when = Math.max(playCtx.currentTime + 0.02, nextPlayTime);
  src.start(when);
  nextPlayTime = when + buf.duration;
}
```

---

## WebSocket handling — browser gotchas

### Messages arrive as Blobs (not strings)

In browsers, WebSocket messages from Gemini come as `Blob` objects.
`JSON.parse(event.data)` will fail silently. Always do:

```typescript
ws.onmessage = async (event) => {
  const text = event.data instanceof Blob
    ? await event.data.text()
    : (event.data as string);
  const msg = JSON.parse(text);
  // ...
};
```

### Connecting state detection on close

The server rejects a bad setup with close code `1000` — the same code used for
a clean close. Track a `connecting` state and treat any close during that state
as an error:

```typescript
ws.onclose = (e) => {
  if (isActive && (e.code !== 1000 || state === 'connecting')) {
    setError(`Session ended: ${e.reason || `code ${e.code}`}`);
  }
};
```

---

## State machine

```
idle ──toggle()──► connecting ──setupComplete──► listening
                                                      │  ▲
                                        model speaks  │  │ turnComplete
                                                      ▼  │
                                                   speaking

any state ──toggle() / error / unmount──► idle
```

---

## Extending

| Goal | How |
|------|-----|
| Change voice | Update `voiceName` in `speechConfig` (options: Aoede, Charon, Fenrir, Kore, Puck) |
| Change model | Update the model string in setup and token mint |
| Add text alongside audio | Add `"TEXT"` to `responseModalities`, parse `part.text` in `onmessage` |
| Migrate off ScriptProcessorNode | Replace with `AudioWorklet` — requires a worklet script file or inline Blob URL |
| Production key security | Keep API key server-side; use ephemeral tokens (see Security section) |

---

## SDK

Install the official Google GenAI SDK (for the server-side token mint):

```bash
npm install @google/genai
```

The browser connects directly via native `WebSocket` — no SDK needed on the
client side.

---

## Known bugs / deprecations to avoid

1. **`realtimeInput.mediaChunks`** — removed in 2025. Use
   `realtimeInput.audio { data, mimeType }` instead. Server closes with
   code 1007 if you use the old field.

2. **Browser Blob messages** — always `await event.data.text()` before
   `JSON.parse`. Never call `JSON.parse(event.data)` directly in the browser.

3. **Close code 1000 during connecting** — treat any close while still in the
   `connecting` state as an error, regardless of close code.

4. **`AudioContext` autoplay policy** — call `audioCtx.resume()` inside a user
   gesture (button click). Browsers block autoplay of audio from scripts.

---

## Quick reference: full message type list

| Direction | Message type | Field path |
|-----------|-------------|------------|
| Client → Server | Session setup | `setup.model` |
| Client → Server | Audio chunk | `realtimeInput.audio.{data, mimeType}` |
| Client → Server | Text / context update | `clientContent.turns[].parts[].text` |
| Client → Server | Tool result | `toolResponse.functionResponses[].{id, response}` |
| Server → Client | Setup confirmed | `setupComplete` |
| Server → Client | Audio chunk | `serverContent.modelTurn.parts[].inlineData.{mimeType, data}` |
| Server → Client | Turn finished | `serverContent.turnComplete` |
| Server → Client | Interrupted | `serverContent.interrupted` |
| Server → Client | Tool invocation | `toolCall.functionCalls[].{id, name, args}` |
| Server → Client | API error | `error.{message, code}` |