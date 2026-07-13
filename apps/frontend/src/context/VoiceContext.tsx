import { createContext, useContext } from 'react';
import { useGeminiLive, type GeminiLiveHandle } from '../hooks/useGeminiLive';

const VoiceContext = createContext<GeminiLiveHandle | null>(null);

const BASE_SYSTEM_PROMPT = `You are an AI assistant embedded in a startup intelligence platform.
Help users understand their startup ecosystem and business operations.
Keep every response to 2-3 sentences. Be analytical and direct.`;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const handle = useGeminiLive(BASE_SYSTEM_PROMPT);
  return <VoiceContext.Provider value={handle}>{children}</VoiceContext.Provider>;
}

export function useVoice(): GeminiLiveHandle {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
