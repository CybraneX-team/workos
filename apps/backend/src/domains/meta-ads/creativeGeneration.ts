import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createUserContent, GoogleGenAI, Modality } from '@google/genai';
import { z } from 'zod';
import type {
  MetaAdsBrandKit,
  MetaAdsCampaignBrief,
  MetaAdsCreativeAspectRatio,
  MetaAdsCreativeAsset,
  MetaAdsCreativeConcept,
  MetaAdsErpProductContext,
} from '@cybranex/shared-types';
import { env } from '../../config.js';
import { pool, supabaseAdmin } from '../../db.js';

const BUCKET = 'meta-ads-creatives';
const RATIOS: MetaAdsCreativeAspectRatio[] = ['1:1', '4:5', '9:16'];

const ConceptSchema = z.object({
  name: z.string().min(1).max(80),
  rationale: z.string().min(1).max(500),
  primaryText: z.string().min(1).max(500),
  headline: z.string().min(1).max(100),
  description: z.string().max(150).default(''),
  callToAction: z.enum(['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_QUOTE']),
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function fixturePng(ratio: MetaAdsCreativeAspectRatio, seed: string): Buffer {
  const [width, height] = ratio === '1:1' ? [120, 120] : ratio === '4:5' ? [120, 150] : [90, 160];
  const digest = createHash('sha256').update(seed).digest();
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      raw[offset] = (digest[0] + x) % 256;
      raw[offset + 1] = (digest[1] + y) % 256;
      raw[offset + 2] = digest[2];
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function imageDimensions(bytes: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === 'image/png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg' && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (mimeType === 'image/webp' && bytes.length >= 30 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    const kind = bytes.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (kind === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
  }
  return null;
}

export function closestAspectRatio(width: number | null, height: number | null): MetaAdsCreativeAspectRatio | null {
  if (!width || !height) return null;
  const value = width / height;
  const targets: Array<[MetaAdsCreativeAspectRatio, number]> = [['1:1', 1], ['4:5', 0.8], ['9:16', 0.5625]];
  const [ratio, target] = targets.sort((a, b) => Math.abs(a[1] - value) - Math.abs(b[1] - value))[0];
  return Math.abs(target - value) <= 0.08 ? ratio : null;
}

function extension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export async function persistMetaCreativeAsset(input: {
  companyId: string;
  userId: string;
  source: 'upload' | 'gemini';
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  aspectRatio?: MetaAdsCreativeAspectRatio | null;
  prompt?: string | null;
  model?: string | null;
  provenance?: Record<string, unknown>;
}): Promise<string> {
  if (input.bytes.length === 0 || input.bytes.length > 10 * 1024 * 1024) throw new Error('creative_asset_size_invalid');
  const id = randomUUID();
  const dimensions = imageDimensions(input.bytes, input.mimeType);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width > 12_000 || dimensions.height > 12_000) {
    throw new Error('creative_asset_invalid_image');
  }
  const detectedRatio = closestAspectRatio(dimensions.width, dimensions.height);
  if (input.aspectRatio && detectedRatio !== input.aspectRatio) throw new Error('creative_asset_aspect_ratio_mismatch');
  const ratio = input.aspectRatio ?? detectedRatio;
  const path = `${input.companyId}/${new Date().toISOString().slice(0, 7)}/${id}.${extension(input.mimeType)}`;
  const checksum = createHash('sha256').update(input.bytes).digest('hex');
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (uploadError) throw new Error('creative_storage_upload_failed');
  try {
    await pool.query(
      `INSERT INTO public.meta_ads_creative_assets
        (id,company_id,source,storage_path,file_name,mime_type,byte_size,width,height,aspect_ratio,checksum,prompt,model,provenance,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)`,
      [id, input.companyId, input.source, path, input.fileName, input.mimeType, input.bytes.length,
        dimensions?.width ?? null, dimensions?.height ?? null, ratio, checksum, input.prompt ?? null,
        input.model ?? null, JSON.stringify(input.provenance ?? {}), input.userId],
    );
  } catch (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return id;
}

export async function signedMetaCreativeAsset(row: Record<string, unknown>): Promise<MetaAdsCreativeAsset> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(String(row.storage_path), 15 * 60);
  if (error || !data?.signedUrl) throw new Error('creative_asset_sign_failed');
  return {
    id: String(row.id),
    source: row.source as 'upload' | 'gemini',
    fileName: String(row.file_name),
    mimeType: String(row.mime_type),
    byteSize: Number(row.byte_size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    aspectRatio: (row.aspect_ratio as MetaAdsCreativeAspectRatio | null) ?? null,
    signedUrl: data.signedUrl,
    prompt: row.prompt ? String(row.prompt) : null,
    model: row.model ? String(row.model) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function explicitContext(brief: MetaAdsCampaignBrief, brand: MetaAdsBrandKit, product: MetaAdsErpProductContext | null): string {
  return JSON.stringify({
    campaign: brief,
    brand: {
      businessName: brand.businessName,
      brandVoice: brand.brandVoice,
      valueProposition: brand.valueProposition,
      targetAudience: brand.targetAudience,
      colors: [brand.primaryColor, brand.secondaryColor].filter(Boolean),
      logoReferenceProvided: Boolean(brand.logoAssetId),
      requiredPhrases: brand.requiredPhrases,
      prohibitedPhrases: brand.prohibitedPhrases,
    },
    product,
  });
}

function fakeConcepts(brief: MetaAdsCampaignBrief): z.infer<typeof ConceptSchema>[] {
  const names = ['Benefit-led clarity', 'Proof-led confidence', 'Direct offer'];
  return names.map((name, index) => ({
    name,
    rationale: `Fixture concept ${index + 1} uses only the approved campaign brief.`,
    primaryText: `${brief.offer} ${brief.proofPoints[index % Math.max(brief.proofPoints.length, 1)] ?? ''}`.trim().slice(0, 500),
    headline: `${brief.goal}: ${brief.offer}`.slice(0, 100),
    description: brief.targetCustomer.slice(0, 150),
    callToAction: brief.callToAction,
  }));
}

function parseConceptResponse(value: string): z.infer<typeof ConceptSchema>[] {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(cleaned) as unknown;
  const array = Array.isArray(parsed) ? parsed : (parsed as { concepts?: unknown })?.concepts;
  return z.array(ConceptSchema).length(3).parse(array);
}

export async function generateMetaCreativeConcepts(input: {
  companyId: string;
  userId: string;
  draftId: string;
  brief: MetaAdsCampaignBrief;
  brand: MetaAdsBrandKit;
  product: MetaAdsErpProductContext | null;
}): Promise<MetaAdsCreativeConcept[]> {
  const fake = env.META_AUTHORING_FAKE_GEMINI && process.env.NODE_ENV !== 'production';
  if (!fake && !env.GEMINI_API_KEY) throw new Error('gemini_not_configured');
  const context = explicitContext(input.brief, input.brand, input.product);
  const logoReference = !fake && input.brand.logoAssetId
    ? await downloadMetaCreativeAsset(input.companyId, input.brand.logoAssetId)
    : null;
  let copy: z.infer<typeof ConceptSchema>[];
  let ai: GoogleGenAI | null = null;
  if (fake) {
    copy = fakeConcepts(input.brief);
  } else {
    ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: `Create exactly three materially different, truthful Meta single-image ad concepts from the supplied context. Do not invent facts, prices, discounts, reviews, certifications, urgency, or product availability. Avoid the prohibited phrases. Return JSON only as {"concepts":[{"name":"","rationale":"","primaryText":"","headline":"","description":"","callToAction":"LEARN_MORE"}]}. Keep primaryText under 500 characters, headline under 100, description under 150. Context: ${context}`,
      config: { responseMimeType: 'application/json', temperature: 0.7 },
    });
    copy = parseConceptResponse(response.text ?? '');
  }

  const concepts: MetaAdsCreativeConcept[] = [];
  for (let index = 0; index < copy.length; index += 1) {
    const item = copy[index];
    const conceptId = randomUUID();
    const assetIds: Partial<Record<MetaAdsCreativeAspectRatio, string>> = {};
    for (const ratio of RATIOS) {
      const prompt = `Create a polished advertising image for concept "${item.name}" at ${ratio}. Use no logos or text unless explicitly present in the brand context. Do not add unverified claims, prices, discounts, UI screenshots, celebrity likenesses, or regulated imagery. Visual concept: ${item.rationale}. Approved context: ${context}`;
      let bytes: Buffer;
      let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/png';
      if (fake) {
        bytes = fixturePng(ratio, `${input.draftId}:${conceptId}:${ratio}`);
      } else {
        const imagePrompt = logoReference
          ? `${prompt} Use the attached approved brand image only as a visual identity reference. Do not alter its wording or invent a different logo.`
          : prompt;
        const response = await ai!.models.generateContent({
          model: env.GEMINI_IMAGE_MODEL,
          contents: logoReference
            ? createUserContent([
                { text: imagePrompt },
                { inlineData: { data: logoReference.bytes.toString('base64'), mimeType: logoReference.mimeType } },
              ])
            : imagePrompt,
          config: {
            responseModalities: [Modality.TEXT, Modality.IMAGE],
            imageConfig: { aspectRatio: ratio, imageSize: '1K', personGeneration: 'ALLOW_ADULT' },
          },
        });
        const inline = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
        if (!inline?.data) throw new Error('gemini_image_missing');
        const returnedType = inline.mimeType || 'image/png';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(returnedType)) throw new Error('gemini_image_type_unsupported');
        mimeType = returnedType as typeof mimeType;
        bytes = Buffer.from(inline.data, 'base64');
      }
      assetIds[ratio] = await persistMetaCreativeAsset({
        companyId: input.companyId,
        userId: input.userId,
        source: 'gemini',
        bytes,
        mimeType,
        fileName: `${item.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${ratio.replace(':', 'x')}.${extension(mimeType)}`,
        aspectRatio: ratio,
        prompt,
        model: fake ? 'fixture-gemini' : env.GEMINI_IMAGE_MODEL,
        provenance: { draftId: input.draftId, conceptId, ratio, logoAssetId: input.brand.logoAssetId },
      });
    }
    concepts.push({ id: conceptId, ...item, assetIds });
  }
  return concepts;
}

export async function downloadMetaCreativeAsset(companyId: string, assetId: string): Promise<{
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}> {
  const { rows } = await pool.query(
    `SELECT storage_path,mime_type,file_name FROM public.meta_ads_creative_assets
      WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL`,
    [assetId, companyId],
  );
  if (!rows[0]) throw new Error('creative_asset_not_found');
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(String(rows[0].storage_path));
  if (error || !data) throw new Error('creative_asset_download_failed');
  return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: String(rows[0].mime_type), fileName: String(rows[0].file_name) };
}
