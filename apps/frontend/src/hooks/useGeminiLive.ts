import { useRef, useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface GeminiLiveHandle {
  voiceState: VoiceState;
  intensityRef: React.MutableRefObject<number>;
  toggle: () => void;
  sendContextUpdate: (text: string) => void;
}

// v1beta regular BidiGenerateContent endpoint + ?key= — matches the official browser
// example (https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket).
// Safe because the key is only issued to authenticated users via the backend
// /api/gemini/token route (protected by authJwt).
const WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Verified available for this API key via GET /v1beta/models (supports bidiGenerateContent).
const LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

// Toggle in browser console: localStorage.setItem('gemini_debug', '1') / removeItem('gemini_debug')
const dbg = (...args: unknown[]) => {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('gemini_debug') === '1') {
    console.log('%c[GeminiLive]', 'color:#a78bfa;font-weight:bold', ...args);
  }
};

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function resampleTo16k(input: Float32Array, srcRate: number): Int16Array {
  if (srcRate === 16000) return float32ToInt16(input);
  const ratio = srcRate / 16000;
  const len = Math.round(input.length / ratio);
  const resampled = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const idx = i * ratio;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, input.length - 1);
    resampled[i] = input[lo] * (1 - (idx - lo)) + input[hi] * (idx - lo);
  }
  return float32ToInt16(resampled);
}

function int16ToFloat32(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 32768;
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binaryStr = '';
  for (let i = 0; i < bytes.length; i++) binaryStr += String.fromCharCode(bytes[i]);
  return btoa(binaryStr);
}

export function useGeminiLive(systemPrompt: string): GeminiLiveHandle {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const voiceStateRef = useRef<VoiceState>('idle');
  const intensityRef = useRef(0);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const intensityRafRef = useRef(0);
  const pendingContextRef = useRef<string | null>(null);

  const activeAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null);

  const systemPromptRef = useRef(systemPrompt);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  function setState(s: VoiceState) {
    voiceStateRef.current = s;
    setVoiceState(s);
  }

  function stopIntensityLoop() {
    if (intensityRafRef.current) {
      cancelAnimationFrame(intensityRafRef.current);
      intensityRafRef.current = 0;
    }
    intensityRef.current = 0;
  }

  function startIntensityLoop() {
    if (intensityRafRef.current) return;
    const tick = () => {
      if (activeAnalyserRef.current) {
        const analyser = activeAnalyserRef.current;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        intensityRef.current = Math.min(1, (sum / data.length) / 128);
      } else {
        intensityRef.current = 0;
      }
      intensityRafRef.current = requestAnimationFrame(tick);
    };
    intensityRafRef.current = requestAnimationFrame(tick);
  }

  function stopAudio() {
    stopIntensityLoop();
    activeAnalyserRef.current = null;
    micAnalyserRef.current = null;
    playbackAnalyserRef.current = null;

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }
    if (captureCtxRef.current) {
      captureCtxRef.current.close().catch(() => {});
      captureCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (playbackCtxRef.current) {
      playbackCtxRef.current.close().catch(() => {});
      playbackCtxRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }

  function closeSession() {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    stopAudio();
    setState('idle');
  }

  function sendWs(msg: object) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function sendContextUpdate(text: string) {
    if (voiceStateRef.current === 'idle' || voiceStateRef.current === 'connecting') {
      pendingContextRef.current = text;
      return;
    }
    sendWs({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    });
  }

  function playAudioChunk(base64Data: string) {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: 24000 });
      const analyser = playbackCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyser.connect(playbackCtxRef.current.destination);
      playbackAnalyserRef.current = analyser;
    }
    const ctx = playbackCtxRef.current;

    const bytes = base64ToBytes(base64Data);
    const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    const float32 = int16ToFloat32(int16);

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackAnalyserRef.current!);

    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now + 0.02;
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += buffer.duration;
  }

  async function startSession() {
    if (voiceStateRef.current !== 'idle') return;
    setState('connecting');
    dbg('startSession — fetching ephemeral token');

    let token: string;
    try {
      const resp = await api.post<{ token: string }>('/api/gemini/token', {
        systemPrompt: systemPromptRef.current,
      });
      token = resp.token;
      dbg('token received, length:', token.length, 'prefix:', token.slice(0, 8) + '…');
    } catch (err) {
      console.error('[useGeminiLive] token fetch failed', err);
      setState('error');
      return;
    }

    const wsUrl = `${WS_BASE}?key=${encodeURIComponent(token)}`;
    dbg('opening WebSocket:', wsUrl.slice(0, 80) + '…');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    let setupDone = false;

    ws.onopen = () => {
      dbg('ws.onopen — readyState:', ws.readyState);
      const setupMsg = {
        setup: {
          model: LIVE_MODEL,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
            },
          },
          systemInstruction: systemPromptRef.current
            ? { parts: [{ text: systemPromptRef.current }] }
            : undefined,
        },
      };
      dbg('sending setup:', JSON.stringify(setupMsg).slice(0, 200));
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = async (event) => {
      const text = event.data instanceof Blob ? await event.data.text() : (event.data as string);
      dbg('ws.onmessage raw:', text.length > 300 ? text.slice(0, 300) + '…[truncated]' : text);

      let msg: any;
      try { msg = JSON.parse(text); } catch (e) {
        dbg('JSON parse error:', e);
        return;
      }

      dbg('parsed keys:', Object.keys(msg));

      if (msg.setupComplete && !setupDone) {
        dbg('setupComplete received');
        setupDone = true;

        if (pendingContextRef.current) {
          dbg('sending pending context:', pendingContextRef.current.slice(0, 80));
          sendWs({
            clientContent: {
              turns: [{ role: 'user', parts: [{ text: pendingContextRef.current }] }],
              turnComplete: true,
            },
          });
          pendingContextRef.current = null;
        }

        try {
          dbg('starting mic capture…');
          await startMicCapture();
          dbg('mic capture started');
          setState('listening');
        } catch (err) {
          console.error('[useGeminiLive] mic capture failed', err);
          dbg('mic capture error:', err);
          closeSession();
          setState('error');
        }
        return;
      }

      if (msg.serverContent) {
        const sc = msg.serverContent;
        dbg('serverContent keys:', Object.keys(sc));

        if (sc.interrupted) {
          dbg('model interrupted');
          if (playbackCtxRef.current) {
            nextPlayTimeRef.current = playbackCtxRef.current.currentTime;
          }
          setState('listening');
          if (micAnalyserRef.current) {
            activeAnalyserRef.current = micAnalyserRef.current;
          }
          return;
        }

        if (sc.modelTurn?.parts) {
          let audioParts = 0;
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/pcm')) {
              audioParts++;
              setState('speaking');
              playAudioChunk(part.inlineData.data);
              if (playbackAnalyserRef.current) {
                activeAnalyserRef.current = playbackAnalyserRef.current;
              }
            }
          }
          if (audioParts) dbg('played', audioParts, 'audio part(s)');
        }

        if (sc.turnComplete) {
          dbg('turnComplete — back to listening');
          setState('listening');
          if (micAnalyserRef.current) {
            activeAnalyserRef.current = micAnalyserRef.current;
          }
        }
      }

      if (msg.toolCall) {
        dbg('toolCall received (unhandled):', JSON.stringify(msg.toolCall));
      }
    };

    ws.onerror = (event) => {
      dbg('ws.onerror:', event);
      console.error('[useGeminiLive] WebSocket error', event);
      closeSession();
      setState('error');
    };

    ws.onclose = (event) => {
      dbg('ws.onclose — code:', event.code, 'reason:', event.reason || '(none)',
        'wasClean:', event.wasClean, 'setupDone:', setupDone,
        'state at close:', voiceStateRef.current);

      // code 1000 during setup = bad token/config; any close while still connecting = error
      if (voiceStateRef.current === 'connecting' || (!setupDone && event.code !== 1000)) {
        dbg('→ error (closed before setup complete)');
        setState('error');
      } else if (!setupDone && event.code === 1000) {
        dbg('→ error (clean close before setupComplete — bad token or model config)');
        setState('error');
      } else if (voiceStateRef.current !== 'idle') {
        dbg('→ idle (normal close after session)');
        setState('idle');
      }
      stopAudio();
      wsRef.current = null;
    };
  }

  async function startMicCapture() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStreamRef.current = stream;

    const ctx = new AudioContext();
    captureCtxRef.current = ctx;
    await ctx.resume();

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    micAnalyserRef.current = analyser;
    source.connect(analyser);

    activeAnalyserRef.current = analyser;
    startIntensityLoop();

    const processor = ctx.createScriptProcessor(4096, 1, 1);
    scriptProcessorRef.current = processor;

    let micChunkCount = 0;
    processor.onaudioprocess = (e) => {
      if (voiceStateRef.current !== 'listening') return;
      const float32 = e.inputBuffer.getChannelData(0);
      const int16 = resampleTo16k(float32, ctx.sampleRate);
      const bytes = new Uint8Array(int16.buffer);
      const b64 = bytesToBase64(bytes);
      sendWs({ realtimeInput: { audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } } });
      micChunkCount++;
      if (micChunkCount <= 3 || micChunkCount % 50 === 0) {
        dbg(`mic chunk #${micChunkCount} sent, bytes: ${bytes.length}, sampleRate: ${ctx.sampleRate}`);
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  }

  const toggle = useCallback(() => {
    if (voiceStateRef.current === 'idle') {
      startSession();
    } else {
      closeSession();
    }
  }, []);

  const sendContextUpdateCb = useCallback((text: string) => {
    sendContextUpdate(text);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeSession();
    };
  }, []);

  return { voiceState, intensityRef, toggle, sendContextUpdate: sendContextUpdateCb };
}
