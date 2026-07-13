import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { api } from '../api';

/* ──────────────────────────────────────────────────
   Types
────────────────────────────────────────────────── */

export type InvestorStatus =
  | 'prospect' | 'contacted' | 'in-discussion' | 'term-sheet' | 'committed' | 'passed';

export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type UpdateStatus = 'draft' | 'sent';

export interface VcFirm {
  id: string;
  name: string;
  short_name: string | null;
  region: string;
  hq_city: string | null;
  website: string | null;
  focus_stage: string[];
  sectors: string[];
  avg_ticket: string | null;
  total_fund: string | null;
  notable_investments: string[];
}

export interface InvestorPipeline {
  id: string;
  company_id: string;
  vc_firm_id: string | null;
  custom_name: string | null;
  custom_firm: string | null;
  partner_name: string | null;
  status: InvestorStatus;
  last_contact: string | null;
  next_followup: string | null;
  ask_amount: string | null;
  notes: string | null;
  warm_intro: boolean;
  intro_by: string | null;
  shared_metrics: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  // joined
  vc_firm?: VcFirm | null;
}

export interface InvestorUpdate {
  id: string;
  company_id: string;
  title: string;
  period: string;
  status: UpdateStatus;
  highlights: string[];
  asks: string[];
  metrics: { mrr?: number; arr?: number; customers?: number; burn?: number; runway?: number };
  sent_to: string[];
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VcMentor {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  company: string | null;
  linkedin: string | null;
  expertise: string[];
  availability: string;
  notes: string | null;
  created_at: string;
}

export interface MentorSession {
  id: string;
  mentor_id: string;
  company_id: string;
  session_date: string;
  status: SessionStatus;
  agenda: string[];
  actions: string[];
  follow_ups: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/* ──────────────────────────────────────────────────
   VC Firms — reference data (public)
────────────────────────────────────────────────── */

export async function getVcFirms(region?: string): Promise<VcFirm[]> {
  let q = supabase.from('vc_firms').select('*').order('name');
  if (region && region !== 'All') q = q.eq('region', region);
  const { data, error } = await q;
  if (error) { console.error('[vc] getVcFirms', error); return []; }
  return (data ?? []).map(r => ({
    ...r,
    focus_stage: r.focus_stage ?? [],
    sectors: r.sectors ?? [],
    notable_investments: r.notable_investments ?? [],
  }));
}

/* ──────────────────────────────────────────────────
   Investor Pipeline — CRUD
────────────────────────────────────────────────── */

export function useInvestorPipeline(companyId: string | null | undefined) {
  const [pipeline, setPipeline] = useState<InvestorPipeline[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPipeline() {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('investor_pipeline')
      .select('*, vc_firms(*)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) { console.error('[vc] fetchPipeline', error); setLoading(false); return; }

    const shaped: InvestorPipeline[] = (data ?? []).map((r: any) => ({
      ...r,
      shared_metrics: r.shared_metrics ?? [],
      tags: r.tags ?? [],
      vc_firm: r.vc_firms ?? null,
    }));
    setPipeline(shaped);
    setLoading(false);
  }

  useEffect(() => {
    fetchPipeline();

    const channel = supabase
      .channel(`pipeline-${companyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'investor_pipeline',
        filter: `company_id=eq.${companyId}`,
      }, fetchPipeline)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [companyId]);

  return { pipeline, loading, refetch: fetchPipeline };
}

export interface AddInvestorInput {
  company_id: string;
  created_by: string;
  vc_firm_id?: string;
  custom_name?: string;
  custom_firm?: string;
  partner_name?: string;
  status?: InvestorStatus;
  ask_amount?: string;
  warm_intro?: boolean;
  intro_by?: string;
  notes?: string;
}

export async function addInvestorToPipeline(input: AddInvestorInput): Promise<InvestorPipeline | null> {
  try {
    const { investor } = await api.post<{ investor: InvestorPipeline }>('/api/ecosystem/investors', input);
    return investor;
  } catch (error) {
    console.error('[vc] addInvestor', error);
    return null;
  }
}

export async function updateInvestorStatus(
  id: string,
  status: InvestorStatus,
  extra?: { notes?: string; last_contact?: string; next_followup?: string },
): Promise<boolean> {
  try {
    await api.patch(`/api/ecosystem/investors/${id}/status`, { status, ...extra });
    return true;
  } catch (error) {
    console.error('[vc] updateInvestorStatus', error);
    return false;
  }
}

export async function updateInvestorNotes(id: string, notes: string): Promise<boolean> {
  try {
    await api.patch(`/api/ecosystem/investors/${id}/notes`, { notes });
    return true;
  } catch (error) {
    console.error('[vc] updateInvestorNotes', error);
    return false;
  }
}

export async function removeInvestorFromPipeline(id: string): Promise<boolean> {
  try {
    await api.delete(`/api/ecosystem/investors/${id}`);
    return true;
  } catch (error) {
    console.error('[vc] removeInvestor', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   Investor Updates — CRUD
────────────────────────────────────────────────── */

export function useInvestorUpdates(companyId: string | null | undefined) {
  const [updates, setUpdates] = useState<InvestorUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchUpdates() {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('investor_updates')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) { console.error('[vc] fetchUpdates', error); setLoading(false); return; }
    const shaped: InvestorUpdate[] = (data ?? []).map((r: any) => ({
      ...r,
      highlights: r.highlights ?? [],
      asks: r.asks ?? [],
      sent_to: r.sent_to ?? [],
      metrics: r.metrics ?? {},
    }));
    setUpdates(shaped);
    setLoading(false);
  }

  useEffect(() => { fetchUpdates(); }, [companyId]);
  return { updates, loading, refetch: fetchUpdates };
}

export async function createInvestorUpdate(
  companyId: string,
  createdBy: string,
  input: Partial<Pick<InvestorUpdate, 'title' | 'period' | 'highlights' | 'asks' | 'metrics'>>,
): Promise<InvestorUpdate | null> {
  void createdBy;
  try {
    const { update } = await api.post<{ update: InvestorUpdate }>('/api/ecosystem/updates', {
      companyId,
      ...input,
    });
    return update;
  } catch (error) {
    console.error('[vc] createUpdate', error);
    return null;
  }
}

export async function saveInvestorUpdate(
  id: string,
  patch: Partial<Pick<InvestorUpdate, 'title' | 'period' | 'highlights' | 'asks' | 'metrics' | 'status'>>,
): Promise<boolean> {
  try {
    await api.patch(`/api/ecosystem/updates/${id}`, patch);
    return true;
  } catch (error) {
    console.error('[vc] saveInvestorUpdate', error);
    return false;
  }
}

export async function markUpdateSent(id: string, recipientIds: string[]): Promise<boolean> {
  try {
    await api.post(`/api/ecosystem/updates/${id}/mark-sent`, { recipientIds });
    return true;
  } catch (error) {
    console.error('[vc] markUpdateSent', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   Mentors — CRUD
────────────────────────────────────────────────── */

export function useMentors(companyId: string | null | undefined) {
  const [mentors, setMentors] = useState<VcMentor[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchMentors() {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('vc_mentors')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[vc] fetchMentors', error); setLoading(false); return; }
    setMentors((data ?? []).map(r => ({ ...r, expertise: r.expertise ?? [] })));
    setLoading(false);
  }

  useEffect(() => { fetchMentors(); }, [companyId]);
  return { mentors, loading, refetch: fetchMentors };
}

export async function addMentor(
  companyId: string,
  addedBy: string,
  input: Pick<VcMentor, 'name' | 'role' | 'company' | 'linkedin' | 'expertise' | 'availability' | 'notes'>,
): Promise<VcMentor | null> {
  void companyId;
  void addedBy;
  try {
    const { mentor } = await api.post<{ mentor: VcMentor }>('/api/ecosystem/mentors', input);
    return mentor;
  } catch (error) {
    console.error('[vc] addMentor', error);
    return null;
  }
}

export async function removeMentorById(id: string): Promise<boolean> {
  try {
    await api.delete(`/api/ecosystem/mentors/${id}`);
    return true;
  } catch (error) {
    console.error('[vc] removeMentor', error);
    return false;
  }
}

/* ──────────────────────────────────────────────────
   Mentor Sessions — CRUD
────────────────────────────────────────────────── */

export function useMentorSessions(companyId: string | null | undefined) {
  const [sessions, setSessions] = useState<MentorSession[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchSessions() {
    if (!companyId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('mentor_sessions')
      .select('*')
      .eq('company_id', companyId)
      .order('session_date', { ascending: false });
    if (error) { console.error('[vc] fetchSessions', error); setLoading(false); return; }
    setSessions((data ?? []).map(r => ({
      ...r,
      agenda: r.agenda ?? [],
      actions: r.actions ?? [],
      follow_ups: r.follow_ups ?? [],
    })));
    setLoading(false);
  }

  useEffect(() => { fetchSessions(); }, [companyId]);
  return { sessions, loading, refetch: fetchSessions };
}

export async function addMentorSession(
  companyId: string,
  createdBy: string,
  input: Pick<MentorSession, 'mentor_id' | 'session_date' | 'status' | 'agenda'>,
): Promise<MentorSession | null> {
  void companyId;
  void createdBy;
  try {
    const { session } = await api.post<{ session: MentorSession }>('/api/ecosystem/mentor-sessions', input);
    return session;
  } catch (error) {
    console.error('[vc] addSession', error);
    return null;
  }
}

export async function updateMentorSession(
  id: string,
  patch: Partial<Pick<MentorSession, 'status' | 'agenda' | 'actions' | 'follow_ups' | 'notes'>>,
): Promise<boolean> {
  try {
    await api.patch(`/api/ecosystem/mentor-sessions/${id}`, patch);
    return true;
  } catch (error) {
    console.error('[vc] updateMentorSession', error);
    return false;
  }
}
