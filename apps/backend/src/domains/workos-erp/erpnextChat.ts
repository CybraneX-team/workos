import { Router } from 'express';
import { env } from '../../config.js';
import { authJwt } from '../../middleware/authJwt.js';
import {
  getStockBalance, getItemList, getLowStockItems,
  getLeads, getOpportunities, getCustomers,
  type ErpNextCreds,
} from '../../adapters/erpnext.js';
import { getErpNextNotConfiguredMessage, resolveErpNextCreds } from '../../lib/erpnextConnection.js';
import { getTenantStatus } from '../../lib/erpnextControlPlane.js';

export const erpnextChatRouter = Router();

const SYSTEM_INSTRUCTION = [
  'You are a business assistant backed by real operational data in WorkOS, covering two areas: inventory/stock, and CRM (leads, opportunities, customers).',
  'Only answer questions in those two areas, and only using the tools provided.',
  'Always call a tool to look up real data before answering — never guess or invent numbers, names, or amounts.',
  'If asked about anything outside inventory or CRM, say briefly that you can only help with those right now.',
  'Keep answers short and concrete: name the specific item/lead/opportunity/customer, and the relevant number (quantity, amount, stage, status).',
].join(' ');

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_stock_balance',
        description: 'Get current stock quantity for an item, optionally filtered by item code or warehouse name.',
        parameters: {
          type: 'object',
          properties: {
            item_code: { type: 'string', description: 'Item code or partial name to filter by (optional)' },
            warehouse: { type: 'string', description: 'Warehouse name or partial name to filter by (optional)' },
          },
        },
      },
      {
        name: 'get_item_list',
        description: 'List items in the item master, optionally filtered by a search term matching the item name.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search term to filter item names (optional)' },
          },
        },
      },
      {
        name: 'get_low_stock_items',
        description: 'List items whose stock quantity is below a threshold (default 10 units).',
        parameters: {
          type: 'object',
          properties: {
            threshold: { type: 'number', description: 'Quantity threshold — items below this are returned (default 10)' },
          },
        },
      },
      {
        name: 'get_leads',
        description: 'List CRM leads, optionally filtered by a search term matching the lead\'s name.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search term to filter lead names (optional)' },
          },
        },
      },
      {
        name: 'get_opportunities',
        description: 'List CRM deals, with deal value, win probability, and pipeline status. Optional search matches the deal\'s organization.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search term to filter by the deal\'s organization (optional)' },
          },
        },
      },
      {
        name: 'get_customers',
        description: 'List CRM customers, optionally filtered by a search term matching the customer name.',
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string', description: 'Search term to filter customer names (optional)' },
          },
        },
      },
    ],
  },
];

async function runTool(creds: ErpNextCreds, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_stock_balance':
      return getStockBalance(creds, args.item_code as string | undefined, args.warehouse as string | undefined);
    case 'get_item_list':
      return getItemList(creds, args.search as string | undefined);
    case 'get_low_stock_items':
      return getLowStockItems(creds, typeof args.threshold === 'number' ? args.threshold : undefined);
    case 'get_leads':
      return getLeads(creds, args.search as string | undefined);
    case 'get_opportunities':
      return getOpportunities(creds, args.search as string | undefined);
    case 'get_customers':
      return getCustomers(creds, args.search as string | undefined);
    default:
      throw new Error(`unknown_tool:${name}`);
  }
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  error?: { message?: string };
}

async function callGemini(contents: GeminiContent[]): Promise<GeminiPart[]> {
  if (!env.GEMINI_API_KEY) throw new Error('gemini_not_configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents,
      tools: TOOLS,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: { temperature: 0.2 },
    }),
  });

  const json = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`gemini_failed:${json.error?.message ?? res.statusText}`);
  }
  return json.candidates?.[0]?.content?.parts ?? [];
}

const MAX_TOOL_ROUNDS = 4;
// Bounds token growth for long-running sessions; the client resends full history each
// turn (session-only memory — no server-side conversation storage).
const MAX_HISTORY_MESSAGES = 20;

interface ChatHistoryMessage {
  sender: 'user' | 'assistant';
  text: string;
}

erpnextChatRouter.get('/status', authJwt, async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  try {
    const status = await getTenantStatus(companyId);
    return res.json({ status: status.status, siteName: status.siteName, deskUrl: status.deskUrl, provisioningStage: status.provisioningStage, error: status.lastError });
  } catch (error) {
    console.error('[erpnextStatus] failed', error);
    return res.status(503).json({ status: 'not_configured', deskUrl: undefined, error: { code: 'control_plane_unavailable', message: 'ERPNext status is temporarily unavailable.', retryable: true } });
  }
});

erpnextChatRouter.post('/chat', authJwt, async (req, res) => {
  const { messages } = req.body as { messages?: ChatHistoryMessage[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages is required' });
  }
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES).filter((m) => m?.text?.trim());
  if (trimmed.length === 0 || trimmed[trimmed.length - 1].sender !== 'user') {
    return res.status(400).json({ error: 'messages must end with a non-empty user message' });
  }

  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });

  const creds = await resolveErpNextCreds(companyId);
  if (!creds) {
    const message = await getErpNextNotConfiguredMessage(companyId);
    return res.status(503).json({ error: 'erpnext_not_configured', message });
  }

  const contents: GeminiContent[] = trimmed.map((m) => ({
    role: m.sender === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const parts = await callGemini(contents);
      const call = parts.find((part) => part.functionCall)?.functionCall;

      if (!call) {
        const text = parts.map((part) => part.text ?? '').join('').trim();
        return res.json({ reply: text || "I couldn't generate a response.", toolCalls });
      }

      const args = call.args ?? {};
      toolCalls.push({ name: call.name, args });

      let toolResult: unknown;
      try {
        toolResult = await runTool(creds, call.name, args);
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : 'tool_failed' };
      }

      contents.push({ role: 'model', parts: [{ functionCall: { name: call.name, args } }] });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: call.name, response: { result: toolResult } } }],
      });
    }

    return res.json({
      reply: "I looked up the data but couldn't finish reasoning about it in time.",
      toolCalls,
    });
  } catch (err) {
    console.error('[erpnextChat] failed', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'erpnext_chat_failed' });
  }
});
