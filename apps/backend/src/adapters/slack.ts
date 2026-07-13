import type { SlackMetrics } from '@cybranex/shared-types';
export type { SlackMetrics };

const SLACK_BASE = 'https://slack.com/api';

async function slackGet<T>(token: string, method: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${SLACK_BASE}/${method}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack HTTP ${res.status}`);
  const data = await res.json() as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new Error(`Slack API error: ${data.error ?? 'unknown'}`);
  return data;
}


export async function validateSlackToken(token: string): Promise<string> {
  const data = await slackGet<{ team?: string; team_id?: string }>(token, 'auth.test');
  return (data as unknown as { team?: string }).team ?? 'Slack Workspace';
}

export async function fetchSlackMetrics(token: string): Promise<SlackMetrics> {
  const [authData, teamData, channelsData] = await Promise.all([
    slackGet<{ team: string; team_id: string; user: string }>(token, 'auth.test'),
    slackGet<{
      team: {
        name: string;
        domain: string;
      };
    }>(token, 'team.info'),
    slackGet<{
      channels: Array<{
        id: string;
        name: string;
        num_members: number;
        is_private: boolean;
        is_archived: boolean;
        topic?: { value: string };
        purpose?: { value: string };
      }>;
      response_metadata?: { next_cursor?: string };
    }>(token, 'conversations.list', {
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '200',
    }),
  ]);

  const channels = channelsData.channels ?? [];
  const publicChannels  = channels.filter((c) => !c.is_private).length;
  const privateChannels = channels.filter((c) =>  c.is_private).length;

  let totalMembers = 0;
  try {
    const usersData = await slackGet<{ members: unknown[] }>(token, 'users.list', { limit: '1000' });
    totalMembers = (usersData.members ?? []).length;
  } catch { /* non-fatal — scope may not be granted */ }

  const topChannels = [...channels]
    .sort((a, b) => b.num_members - a.num_members)
    .slice(0, 8)
    .map((c) => ({
      name: c.name,
      memberCount: c.num_members,
      isPrivate: c.is_private,
      topic: c.topic?.value?.slice(0, 60) ?? c.purpose?.value?.slice(0, 60) ?? '',
    }));

  return {
    workspaceName: teamData.team?.name ?? (authData as unknown as { team: string }).team ?? 'Slack',
    workspaceDomain: teamData.team?.domain ?? '',
    totalMembers,
    totalChannels: channels.length,
    publicChannels,
    privateChannels,
    topChannels,
  };
}
