import type { JiraMetrics } from '@cybranex/shared-types';
export type { JiraMetrics };

const JIRA_AGILE_BASE = '/rest/agile/1.0';
const JIRA_API_BASE   = '/rest/api/3';

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function jiraHeaders(email: string, apiToken: string) {
  const creds = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return {
    Authorization: `Basic ${creds}`,
    Accept: 'application/json',
  };
}

async function jiraGet<T>(domain: string, email: string, apiToken: string, path: string): Promise<T> {
  const url = `https://${normalizeDomain(domain)}${path}`;
  const res = await fetch(url, { headers: jiraHeaders(email, apiToken) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function jiraSearch(
  domain: string, email: string, apiToken: string,
  jql: string, fields: string[], maxResults = 50,
): Promise<{ total: number; issues: JiraIssueRaw[] }> {
  const url = new URL(`https://${normalizeDomain(domain)}${JIRA_API_BASE}/search`);
  url.searchParams.set('jql', jql);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url.toString(), { headers: jiraHeaders(email, apiToken) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira search ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<{ total: number; issues: JiraIssueRaw[] }>;
}

interface JiraIssueRaw {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string; statusCategory?: { name?: string } };
    issuetype?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string } | null;
    created?: string;
  };
}

interface JiraBoardRaw {
  id: number;
  name: string;
  type: string;
}

interface JiraSprintRaw {
  id: number;
  name: string;
  state: string;
}


export async function validateJiraCredentials(domain: string, email: string, apiToken: string): Promise<string> {
  const me = await jiraGet<{ displayName?: string; emailAddress?: string }>(
    domain, email, apiToken, `${JIRA_API_BASE}/myself`,
  );
  return me.displayName ?? me.emailAddress ?? email;
}

export async function fetchJiraMetrics(domain: string, email: string, apiToken: string): Promise<JiraMetrics> {
  const me = await jiraGet<{ displayName?: string }>(domain, email, apiToken, `${JIRA_API_BASE}/myself`);
  const workspaceName = me.displayName ?? 'Jira Workspace';

  const [openRes, inProgressRes, resolvedRes, bugsRes, recentRes] = await Promise.allSettled([
    jiraSearch(domain, email, apiToken, 'statusCategory != Done ORDER BY created DESC', ['summary'], 1),
    jiraSearch(domain, email, apiToken, 'statusCategory = "In Progress" ORDER BY updated DESC', ['summary', 'status', 'issuetype', 'priority', 'assignee'], 50),
    jiraSearch(domain, email, apiToken, 'statusCategory = Done AND updated >= -30d', ['summary'], 1),
    jiraSearch(domain, email, apiToken, 'issuetype = Bug AND statusCategory != Done', ['summary'], 1),
    jiraSearch(domain, email, apiToken, 'ORDER BY created DESC', ['summary', 'status', 'issuetype', 'priority', 'assignee', 'created'], 8),
  ]);

  const totalOpenIssues  = openRes.status       === 'fulfilled' ? openRes.value.total       : 0;
  const inProgressIssues = inProgressRes.status === 'fulfilled' ? inProgressRes.value.total  : 0;
  const resolvedLast30d  = resolvedRes.status   === 'fulfilled' ? resolvedRes.value.total    : 0;
  const openBugs         = bugsRes.status        === 'fulfilled' ? bugsRes.value.total        : 0;

  const recentRaw = recentRes.status === 'fulfilled' ? recentRes.value.issues : [];
  const recentIssues = recentRaw.map((i) => ({
    key: i.key,
    summary: (i.fields.summary ?? '').slice(0, 80),
    type: i.fields.issuetype?.name ?? 'Task',
    priority: i.fields.priority?.name ?? 'Medium',
    status: i.fields.status?.name ?? 'Open',
    assignee: i.fields.assignee?.displayName ?? null,
  }));

  // Issue-type and priority breakdowns from in-progress + recent issues
  const allIssuesForBreakdown = [
    ...(inProgressRes.status === 'fulfilled' ? inProgressRes.value.issues : []),
    ...recentRaw,
  ];
  const typeMap = new Map<string, number>();
  const prioMap = new Map<string, number>();
  for (const i of allIssuesForBreakdown) {
    const t = i.fields.issuetype?.name ?? 'Task';
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
    const p = i.fields.priority?.name ?? 'Medium';
    prioMap.set(p, (prioMap.get(p) ?? 0) + 1);
  }
  const issuesByType     = Array.from(typeMap.entries()).map(([type, count])     => ({ type, count })).sort((a, b) => b.count - a.count);
  const issuesByPriority = Array.from(prioMap.entries()).map(([priority, count]) => ({ priority, count })).sort((a, b) => b.count - a.count);

  // Active sprint (best effort via agile API)
  let activeSprintName: string | null = null;
  let activeSprintTotal = 0;
  let activeSprintDone  = 0;
  try {
    const boards = await jiraGet<{ values: JiraBoardRaw[] }>(domain, email, apiToken, `${JIRA_AGILE_BASE}/board?maxResults=1`);
    if (boards.values.length > 0) {
      const boardId = boards.values[0].id;
      const sprints = await jiraGet<{ values: JiraSprintRaw[] }>(
        domain, email, apiToken, `${JIRA_AGILE_BASE}/board/${boardId}/sprint?state=active&maxResults=1`,
      );
      if (sprints.values.length > 0) {
        const sprint = sprints.values[0];
        activeSprintName = sprint.name;
        const [sprintIssues, sprintDone] = await Promise.all([
          jiraSearch(domain, email, apiToken, `sprint = ${sprint.id}`, ['summary'], 1),
          jiraSearch(domain, email, apiToken, `sprint = ${sprint.id} AND statusCategory = Done`, ['summary'], 1),
        ]);
        activeSprintTotal = sprintIssues.total;
        activeSprintDone  = sprintDone.total;
      }
    }
  } catch { /* agile API not available on all plans — skip */ }

  return {
    workspaceName,
    totalOpenIssues,
    inProgressIssues,
    resolvedLast30d,
    openBugs,
    activeSprintName,
    activeSprintTotal,
    activeSprintDone,
    recentIssues,
    issuesByType:     issuesByType.length     ? issuesByType     : [{ type: 'Task', count: totalOpenIssues }],
    issuesByPriority: issuesByPriority.length ? issuesByPriority : [{ priority: 'Medium', count: totalOpenIssues }],
  };
}
