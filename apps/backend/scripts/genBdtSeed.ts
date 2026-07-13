import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRANCH_KINDS,
  DEPT_LEVEL1_NODES,
  DEPT_META,
  type BranchKind,
} from '../src/data/bdtCatalog.ts';

type SpecRow = {
  level1Label: string;
  branchItems: string[];
  actionExamples: string[];
  integrations: string[];
  metricImpacts: string[];
};

type SpecDepartment = {
  departmentLabel: string;
  sourceKey: string;
  rows: SpecRow[];
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '../..');
const specPath = path.resolve(repoRoot, 'specs/BDT_Department_Root_Branch_Action_Node_System.docx');
const specOutPath = path.resolve(backendRoot, 'src/data/bdtSpecTree.ts');
const seedOutPath = path.resolve(backendRoot, 'src/data/bdtSeed.ts');

const DEPT_PREFIX: Record<string, string> = {
  dept_engineering: 'eng',
  dept_product: 'prd',
  dept_sales: 'sal',
  dept_marketing: 'mkt',
  dept_hr: 'hr',
  dept_finance: 'fin',
  dept_operations: 'ops',
  dept_data: 'dat',
  dept_design: 'des',
  dept_security: 'sec',
  dept_customer_success: 'cs',
  dept_legal: 'leg',
  dept_strategy: 'str',
};

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractDocxParagraphs(filePath: string): string[] {
  const xml = execFileSync('unzip', ['-p', filePath, 'word/document.xml'], { encoding: 'utf8' });
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs
    .map((paragraph) => {
      const textRuns = paragraph.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) ?? [];
      return textRuns
        .map((run) => decodeXml(run.replace(/<[^>]+>/g, '')))
        .join('')
        .trim();
    })
    .filter(Boolean);
}

function splitSemicolonList(value: string): string[] {
  return value.split(';').map((item) => item.trim()).filter(Boolean);
}

function splitCommaList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseSpec(lines: string[]): SpecDepartment[] {
  const sectionStarts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^8\.\d+\s+/.test(line));

  return sectionStarts.map(({ line, index }, sectionIndex) => {
    const nextSectionIndex = sectionStarts[sectionIndex + 1]?.index
      ?? lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^9\./.test(candidate));
    const chunk = lines.slice(index, nextSectionIndex > 0 ? nextSectionIndex : undefined);
    const departmentLabel = line.replace(/^8\.\d+\s+/, '');
    const headerIndex = chunk.findIndex((candidate) => candidate === 'Metric Impact');
    const exampleIndex = chunk.findIndex((candidate) => candidate === 'Example card types');
    if (headerIndex === -1 || exampleIndex === -1 || exampleIndex <= headerIndex) {
      throw new Error(`Unable to parse department spec table for ${departmentLabel}`);
    }

    const rows: SpecRow[] = [];
    for (let i = headerIndex + 1; i + 4 < exampleIndex; i += 5) {
      rows.push({
        level1Label: chunk[i],
        branchItems: splitSemicolonList(chunk[i + 1]),
        actionExamples: splitSemicolonList(chunk[i + 2]),
        integrations: splitCommaList(chunk[i + 3]),
        metricImpacts: splitSemicolonList(chunk[i + 4]),
      });
    }

    const sourceKey = DEPT_META.find((department) => department.label === departmentLabel)?.id;
    if (!sourceKey) throw new Error(`Spec department is not in backend catalog: ${departmentLabel}`);

    return { departmentLabel, sourceKey, rows };
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'node';
}

function pick<T>(items: T[], index: number): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[index % items.length];
}

function verbFromAction(label: string): string {
  return label.trim().split(/\s+/)[0] || 'Update';
}

function buildMetadata(department: SpecDepartment, row: SpecRow, branchItem: string, level1SourceKey: string) {
  return {
    specSource: 'BDT_Department_Root_Branch_Action_Node_System.docx',
    departmentLabel: department.departmentLabel,
    level1Label: row.level1Label,
    branchItem,
    actionExamples: row.actionExamples,
    integrations: row.integrations,
    metricImpacts: row.metricImpacts,
    // Content-derived, stable across tree reorders — unlike the positional `id`/`source_key`
    // column (`${prefix}_l1_${level1Index}_b${branchIndex}`), this survives inserting, removing,
    // or reordering branches/Level-1s elsewhere in the department. Shared by the branch node and
    // both its children (action + metric leaf), since they all reuse this same metadata object.
    sourceKey: `${level1SourceKey}_${slug(branchItem)}`,
  };
}

function buildSeedDepartment(department: SpecDepartment) {
  const meta = DEPT_META.find((candidate) => candidate.id === department.sourceKey);
  if (!meta) throw new Error(`Missing catalog metadata for ${department.sourceKey}`);

  const level1Defs = DEPT_LEVEL1_NODES[department.sourceKey] ?? [];
  if (level1Defs.length !== department.rows.length) {
    throw new Error(`${department.departmentLabel} has ${department.rows.length} spec rows but ${level1Defs.length} catalog Level-1 nodes`);
  }

  const prefix = DEPT_PREFIX[department.sourceKey];
  if (!prefix) throw new Error(`Missing id prefix for ${department.sourceKey}`);

  return {
    id: meta.id,
    source_key: meta.id,
    label: meta.label,
    domain: meta.domain,
    cluster: meta.cluster,
    color: meta.color,
    score: meta.score,
    metrics: meta.metrics,
    internalNodes: department.rows.map((row, level1Index) => {
      const level1Def = level1Defs[level1Index];
      if (level1Def.label !== row.level1Label) {
        throw new Error(`${department.departmentLabel} Level-1 mismatch at ${level1Index}: spec=${row.level1Label} catalog=${level1Def.label}`);
      }
      const branchKind = level1Def.mappedUniversalCategory as BranchKind;
      if (!BRANCH_KINDS.has(branchKind)) throw new Error(`Invalid branch kind ${branchKind}`);

      return {
        id: `${prefix}_l1_${level1Index}`,
        label: row.level1Label,
        type: 'branch',
        score: meta.score,
        nodeLevel: 'level1',
        mappedUniversalCategory: level1Def.mappedUniversalCategory,
        metadata: {
          sourceKey: level1Def.sourceKey,
          specSource: 'BDT_Department_Root_Branch_Action_Node_System.docx',
        },
        children: row.branchItems.map((branchItem, branchIndex) => {
          const branchId = `${prefix}_l1_${level1Index}_b${branchIndex}`;
          const actionLabel = pick(row.actionExamples, branchIndex);
          const metricImpact = pick(row.metricImpacts, branchIndex);
          const metadata = buildMetadata(department, row, branchItem, level1Def.sourceKey);
          return {
            id: branchId,
            label: branchItem,
            type: 'branch',
            score: meta.score,
            nodeLevel: 'branch',
            branchKind,
            metadata,
            children: [
              {
                id: `${branchId}_a0`,
                label: actionLabel,
                type: 'action',
                score: meta.score,
                nodeLevel: 'action',
                owner: 'Department Head',
                dueDate: 'Next 7 days',
                status: 'Open',
                output: `${actionLabel} completion evidence`,
                metricImpact,
                workflowSteps: [
                  'Gather context',
                  actionLabel,
                  'Document outcome',
                  'Update related metrics',
                ],
                metadata,
                actionDetails: {
                  verb: verbFromAction(actionLabel),
                  description: `${actionLabel} for ${department.departmentLabel} / ${row.level1Label} / ${branchItem}`,
                  stateChange: `${branchItem} updated in ${department.departmentLabel}`,
                  checklist: [
                    'Gather context',
                    actionLabel,
                    'Document outcome',
                    'Update related metrics',
                  ],
                },
                children: [],
              },
              {
                id: `${branchId}_m0`,
                label: `${branchItem} health`,
                type: 'metric',
                score: meta.score,
                nodeLevel: 'action',
                owner: 'Metrics Owner',
                status: 'Open',
                output: `${branchItem} metric report`,
                metricImpact,
                metricKey: `spec_${slug(department.sourceKey)}_${slug(level1Def.sourceKey)}_${slug(branchItem)}`,
                metadata,
                metricDetails: {
                  name: metricImpact,
                  value: 0,
                  target: 100,
                  unit: '%',
                  trend: 'flat',
                  status: 'warning',
                },
                children: [],
              },
            ],
          };
        }),
      };
    }),
  };
}

function generatedHeader(source: string): string {
  return [
    `// AUTO-GENERATED by ${source} - do not edit by hand.`,
    '// Regenerate after changing the BDT spec document or catalog metadata.',
    '',
  ].join('\n');
}

function writeSpecTree(specTree: SpecDepartment[]) {
  const body = `${generatedHeader('scripts/genBdtSeed.ts')}
export type BdtSpecRow = {
  level1Label: string;
  branchItems: string[];
  actionExamples: string[];
  integrations: string[];
  metricImpacts: string[];
};

export type BdtSpecDepartment = {
  departmentLabel: string;
  sourceKey: string;
  rows: BdtSpecRow[];
};

export const BDT_SPEC_TREE: BdtSpecDepartment[] = ${JSON.stringify(specTree, null, 2)};
`;
  mkdirSync(path.dirname(specOutPath), { recursive: true });
  writeFileSync(specOutPath, body);
}

function writeSeed(seedDepartments: unknown[]) {
  const body = `${generatedHeader('scripts/genBdtSeed.ts')}
export type BdtSeedDepartment = {
  id?: string;
  source_key?: string;
  label: string;
  domain?: string;
  cluster?: string;
  color?: string;
  score?: number;
  metrics?: Record<string, number>;
  internalNodes?: unknown[];
  [key: string]: unknown;
};

export const BDT_SEED_DEPARTMENTS: BdtSeedDepartment[] = ${JSON.stringify(seedDepartments, null, 2)};
`;
  writeFileSync(seedOutPath, body);
}

const lines = extractDocxParagraphs(specPath);
const specTree = parseSpec(lines);
const seedDepartments = specTree.map(buildSeedDepartment);

writeSpecTree(specTree);
writeSeed(seedDepartments);

const branchCount = specTree.reduce((sum, department) =>
  sum + department.rows.reduce((rowSum, row) => rowSum + row.branchItems.length, 0), 0);
console.log(`Generated ${specTree.length} departments, ${branchCount} spec branch nodes.`);
