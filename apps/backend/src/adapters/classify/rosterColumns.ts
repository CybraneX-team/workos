import { env } from '../../config.js';
import type { RosterHeaderTarget } from '../excel/rosterExtraction.js';

// Distinct from classify/llm.ts (which classifies financial-metric labels for
// the metrics ingestion pipeline) — this classifies roster spreadsheet
// *column headers* against the startup-roster field vocabulary. Batched into
// one call per file rather than one call per header, since a roster sheet
// usually has only a handful of unresolved columns.

const ALLOWED_TARGETS = new Set<string>([
  'name', 'contactEmail', 'contactName', 'website', 'stage', 'sector',
  'country', 'foundedYear', 'metric', 'null',
]);

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

function parseResolutions(text: string, headers: string[]): Record<string, RosterHeaderTarget> {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  const headerSet = new Set(headers);
  const result: Record<string, RosterHeaderTarget> = {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const [header, target] of Object.entries(parsed)) {
      if (!headerSet.has(header)) continue;
      if (typeof target !== 'string' || !ALLOWED_TARGETS.has(target)) continue;
      result[header] = target === 'null' ? null : (target as RosterHeaderTarget);
    }
  } catch {
    return {};
  }
  return result;
}

export async function classifyRosterHeaders(
  unresolvedHeaders: string[],
  sampleRows: string[][],
): Promise<Record<string, RosterHeaderTarget>> {
  if (!env.GEMINI_API_KEY || unresolvedHeaders.length === 0) return {};

  const prompt = [
    'You map spreadsheet column headers from a startup incubator roster to a fixed field vocabulary.',
    'Return only valid JSON: an object mapping each input header (verbatim) to exactly one of:',
    '"name", "contactEmail", "contactName", "website", "stage", "sector", "country", "foundedYear", "metric", "null".',
    'Use "metric" for numeric business metrics (e.g. ARR, team size, users) that don\'t fit any other field.',
    'Use "null" for headers that are not useful (notes, internal ids, blank labels).',
    'Headers to classify:',
    JSON.stringify(unresolvedHeaders),
    'Sample data rows (for context, aligned by position to some sheet\'s columns, not necessarily these headers):',
    JSON.stringify(sampleRows.slice(0, 5)),
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });

    const json = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      console.warn('[rosterColumns] gemini classification failed', json.error?.message);
      return {};
    }

    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
    return text ? parseResolutions(text, unresolvedHeaders) : {};
  } catch (err) {
    console.warn('[rosterColumns] gemini request failed', err instanceof Error ? err.message : String(err));
    return {};
  }
}
