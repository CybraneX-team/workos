import { env } from '../../config.js';
import type { ClassificationInput, ClassificationOutput } from './types.js';

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

const ALLOWED_ROLES = new Set(['metric', 'exclude']);

function parseJson(text: string): ClassificationOutput | null {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(trimmed) as Partial<ClassificationOutput>;
    const role = typeof parsed.role === 'string' && ALLOWED_ROLES.has(parsed.role)
      ? parsed.role
      : 'metric';
    const target_key = typeof parsed.target_key === 'string' && parsed.target_key.trim()
      ? parsed.target_key.trim().toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_.]/g, '')
      : null;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 500) : undefined;
    return { role: role as ClassificationOutput['role'], target_key, confidence, reasoning };
  } catch {
    return null;
  }
}

export async function classifyWithGemini(input: ClassificationInput): Promise<ClassificationOutput | null> {
  if (!env.GEMINI_API_KEY) return null;
  if (!input.label?.trim()) return null;

  const prompt = [
    'You classify spreadsheet business metric labels for a startup metrics ingestion system.',
    'Return only valid JSON with this shape:',
    '{"role":"metric"|"exclude","target_key":string|null,"confidence":number,"reasoning":string}',
    'Prefer these canonical metric keys when applicable:',
    'revenue, mrr, arr, burn, cash, headcount, ad_spend, signups, cac, ltv, gross_margin_pct, cost_of_goods_sold, operating_expenses.',
    'Use role "exclude" for totals, subtotals, blank labels, notes, or non-metric rows.',
    'Use confidence >= 0.85 only for clear, common business metric matches.',
    'Input:',
    JSON.stringify(input),
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
      },
    }),
  });

  const json = await response.json() as GeminiResponse;
  if (!response.ok) {
    throw new Error(`gemini_classification_failed:${json.error?.message ?? response.statusText}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
  return text ? parseJson(text) : null;
}
