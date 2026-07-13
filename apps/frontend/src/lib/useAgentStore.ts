/**
 * Phase 6 — Agent Execution Layer
 * Tracks agent executions: context pack → plan → approval → output → sync
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'bdt_agent_executions_v1';

export type AgentType = 'research' | 'strategy' | 'project' | 'data' | 'writing' | 'finance' | 'legal' | 'meeting' | 'custom';
export type AgentStatus = 'idle' | 'planning' | 'awaiting_approval' | 'executing' | 'reviewing' | 'approved' | 'rejected' | 'done';
export type OutputFormat = 'text' | 'bullet_list' | 'structured' | 'code';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';

export const AGENT_TYPE_META: Record<AgentType, { label: string; color: string; description: string }> = {
  research:  { label: 'Research',   color: '#60a5fa', description: 'Gather and synthesise information from workspace and context' },
  strategy:  { label: 'Strategy',   color: '#a78bfa', description: 'Scenario analysis, roadmap planning, and decision support' },
  project:   { label: 'Project',    color: '#34d399', description: 'Break down goals into tasks, milestones, and owners' },
  data:      { label: 'Data',       color: '#22d3ee', description: 'Metric analysis, trend detection, and forecasting' },
  writing:   { label: 'Writing',    color: '#fbbf24', description: 'Proposals, emails, docs, and communication drafts' },
  finance:   { label: 'Finance',    color: '#fb7185', description: 'Runway, burn, budget, and financial scenario modelling' },
  legal:     { label: 'Legal',      color: '#f472b6', description: 'Compliance checklists, contract review, risk flags' },
  meeting:   { label: 'Meeting',    color: '#94a3b8', description: 'Agenda prep, notes, action items, and summaries' },
  custom:    { label: 'Custom',     color: '#c1aeff', description: 'User-defined agent task with workspace context' },
};

export interface AgentPlanStep {
  step: number;
  action: string;
  rationale: string;
}

export interface AgentOutput {
  format: OutputFormat;
  headline: string;
  body: string;
  bullets?: string[];
  generatedAt: string;
  reviewStatus: ReviewStatus;
  reviewNotes?: string;
  reviewedAt?: string;
}

export interface AgentExecution {
  id: string;
  agentType: AgentType;
  status: AgentStatus;
  title: string;             // user-visible task label
  prompt: string;            // what the user asked for
  contextSummary: string;    // auto-generated from workspace snapshot
  plan?: AgentPlanStep[];
  planApprovedAt?: string;
  output?: AgentOutput;
  projectId?: string;
  taskId?: string;
  cardId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

function load(): AgentExecution[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

function persist(execs: AgentExecution[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(execs)); } catch { /* quota */ }
}

function uid() { return `ae_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

export function useAgentStore() {
  const [executions, setExecutions] = useState<AgentExecution[]>(() => load());

  const update = useCallback((mutate: (s: AgentExecution[]) => AgentExecution[]) => {
    setExecutions(prev => { const next = mutate(prev); persist(next); return next; });
  }, []);

  const createExecution = useCallback((input: {
    agentType: AgentType;
    title: string;
    prompt: string;
    contextSummary: string;
    projectId?: string;
    taskId?: string;
    cardId?: string;
  }): string => {
    const id = uid();
    const exec: AgentExecution = {
      id,
      ...input,
      status: 'planning',
      createdAt: new Date().toISOString(),
    };
    update(s => [exec, ...s]);
    return id;
  }, [update]);

  const setPlan = useCallback((id: string, plan: AgentPlanStep[]) => {
    update(s => s.map(e => e.id === id ? { ...e, plan, status: 'awaiting_approval' } : e));
  }, [update]);

  const approvePlan = useCallback((id: string) => {
    update(s => s.map(e => e.id === id ? {
      ...e, status: 'executing', planApprovedAt: new Date().toISOString(), startedAt: new Date().toISOString(),
    } : e));
  }, [update]);

  const rejectPlan = useCallback((id: string, reason?: string) => {
    update(s => s.map(e => e.id === id ? { ...e, status: 'rejected', errorMessage: reason } : e));
  }, [update]);

  const setOutput = useCallback((id: string, output: AgentOutput) => {
    update(s => s.map(e => e.id === id ? {
      ...e, output, status: 'reviewing', completedAt: new Date().toISOString(),
    } : e));
  }, [update]);

  const approveOutput = useCallback((id: string, notes?: string) => {
    update(s => s.map(e => e.id === id ? {
      ...e,
      status: 'done',
      output: e.output ? { ...e.output, reviewStatus: 'approved', reviewNotes: notes, reviewedAt: new Date().toISOString() } : e.output,
    } : e));
  }, [update]);

  const requestRevision = useCallback((id: string, notes: string) => {
    update(s => s.map(e => e.id === id ? {
      ...e,
      status: 'awaiting_approval',
      output: e.output ? { ...e.output, reviewStatus: 'needs_revision', reviewNotes: notes } : e.output,
    } : e));
  }, [update]);

  const deleteExecution = useCallback((id: string) => {
    update(s => s.filter(e => e.id !== id));
  }, [update]);

  const clearAll = useCallback(() => { update(() => []); }, [update]);

  const pending = executions.filter(e => e.status === 'awaiting_approval' || e.status === 'reviewing');
  const active  = executions.filter(e => e.status === 'planning' || e.status === 'executing');

  return {
    executions,
    pending,
    active,
    createExecution,
    setPlan,
    approvePlan,
    rejectPlan,
    setOutput,
    approveOutput,
    requestRevision,
    deleteExecution,
    clearAll,
  };
}
