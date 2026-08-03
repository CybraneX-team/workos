import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, CheckCircle2, ClipboardCheck, Download, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS,
  businessDiagnosisQuestionsForSector,
  type BusinessDiagnosisAnswers,
  type BusinessDiagnosisDynamicQuestion,
  type BusinessDiagnosisQuestion,
  type BusinessDiagnosisReport,
} from '@cybranex/shared-types';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/db/companies';
import { completeBusinessDiagnosis, downloadBusinessDiagnosisExcel, fetchBusinessDiagnosis, fetchBusinessDiagnosisFollowUps, type BusinessDiagnosisStatus } from '../lib/db/businessDiagnosis';

const accent = '#C1AEFF';
const panel: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.09)', borderRadius: 16, background: 'rgba(17,17,23,.82)', padding: 24 };

function inputValue(value: BusinessDiagnosisAnswers[string] | undefined) { return typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''; }

function Question({ question, answers, setAnswers }: { question: BusinessDiagnosisQuestion | BusinessDiagnosisDynamicQuestion; answers: BusinessDiagnosisAnswers; setAnswers: React.Dispatch<React.SetStateAction<BusinessDiagnosisAnswers>> }) {
  const value = answers[question.id];
  const set = (next: BusinessDiagnosisAnswers[string]) => setAnswers((current) => ({ ...current, [question.id]: next }));
  const choices = question.options ?? [];
  return <label style={{ display: 'block', marginBottom: 20 }}>
    <span style={{ display: 'block', marginBottom: 8, color: '#f5f3ff', fontSize: 14, fontWeight: 600 }}>{question.label}</span>
    {question.type === 'text' ? <textarea value={inputValue(value)} onChange={(event) => set(event.target.value)} rows={3} style={fieldStyle} /> : null}
    {question.type === 'number' ? <input type="number" value={inputValue(value)} min={'min' in question ? question.min : undefined} max={'max' in question ? question.max : undefined} onChange={(event) => set(event.target.value === '' ? '' : Number(event.target.value))} style={fieldStyle} /> : null}
    {question.type === 'select' ? <select value={inputValue(value)} onChange={(event) => set(event.target.value)} style={fieldStyle}><option value="">Select one</option>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select> : null}
    {question.type === 'radio' ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{choices.map((choice) => <button key={choice} type="button" onClick={() => set(choice)} style={choiceStyle(value === choice)}>{choice}</button>)}</div> : null}
    {question.type === 'multiselect' ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{choices.map((choice) => {
      const selected = Array.isArray(value) && value.includes(choice);
      return <button key={choice} type="button" onClick={() => set(selected ? (value as string[]).filter((item) => item !== choice) : [...(Array.isArray(value) ? value : []), choice])} style={choiceStyle(selected)}>{choice}</button>;
    })}</div> : null}
  </label>;
}

const fieldStyle: React.CSSProperties = { width: '100%', color: '#fff', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '11px 12px', resize: 'vertical' };
const choiceStyle = (selected: boolean): React.CSSProperties => ({ border: `1px solid ${selected ? accent : 'rgba(255,255,255,.13)'}`, background: selected ? 'rgba(193,174,255,.18)' : 'rgba(255,255,255,.04)', color: selected ? '#f0ebff' : 'rgba(255,255,255,.72)', borderRadius: 999, padding: '7px 10px', fontSize: 12, cursor: 'pointer' });

function Report({ report }: { report: BusinessDiagnosisReport }) {
  return <div style={{ display: 'grid', gap: 18 }}>
    <section style={panel}><h2 style={heading}>Executive summary</h2><p style={body}>{report.executiveSummary}</p><p style={{ ...body, color: 'rgba(255,255,255,.58)' }}>{report.businessContext}</p></section>
    <section style={panel}><h2 style={heading}>Root causes</h2>{report.rootCauses.map((item) => <div key={item.title} style={itemStyle}><strong>{item.title}</strong><span style={tagStyle(item.impact)}>{item.impact} impact · {item.urgency} urgency</span><p style={body}>{item.evidence}</p></div>)}</section>
    <section style={panel}><h2 style={heading}>Priorities</h2>{report.priorities.map((item) => <div key={item.rank} style={itemStyle}><strong>{item.rank}. {item.issue}</strong><p style={body}>{item.whyNow}</p></div>)}</section>
    <section style={panel}><h2 style={heading}>Recommended AI and digital actions</h2>{report.recommendations.map((item) => <div key={item.title} style={itemStyle}><div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}><strong>{item.title}</strong><span style={tagStyle(item.effort)}>{item.effort} effort</span></div><p style={body}><b>Addresses:</b> {item.problemAddressed}</p><p style={body}>{item.whyFit}</p><p style={body}><b>Expected benefit:</b> {item.expectedBenefit}</p><p style={body}><b>Prerequisites:</b> {item.prerequisites.join(' · ')}</p><p style={body}><b>Risks:</b> {item.implementationRisks.join(' · ')}</p></div>)}</section>
    <section style={panel}><h2 style={heading}>Roadmap</h2><Roadmap title="0–30 days" items={report.roadmap.days0To30} /><Roadmap title="31–90 days" items={report.roadmap.days31To90} /><Roadmap title="Later" items={report.roadmap.later} /></section>
    <section style={panel}><h2 style={heading}>Measures to track</h2>{report.measures.map((item) => <div key={item.name} style={itemStyle}><strong>{item.name}</strong><p style={body}>{item.reason}</p></div>)}</section>
  </div>;
}
function Roadmap({ title, items }: { title: string; items: string[] }) { return <div style={{ marginBottom: 16 }}><strong style={{ color: '#fff' }}>{title}</strong><ul style={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.7, margin: '7px 0 0', paddingLeft: 20 }}>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>; }
const heading: React.CSSProperties = { margin: '0 0 12px', color: '#fff', fontSize: 18 };
const body: React.CSSProperties = { color: 'rgba(255,255,255,.72)', lineHeight: 1.6, margin: '7px 0' };
const itemStyle: React.CSSProperties = { borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14, marginTop: 14, color: '#fff' };
const tagStyle = (level: string): React.CSSProperties => ({ color: level === 'high' ? '#fda4af' : level === 'medium' ? '#fcd34d' : '#86efac', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' });

export default function BusinessDiagnosis() {
  const navigate = useNavigate();
  const { profile, role, loading } = useAuth();
  const { company } = useCompany(profile?.company_id);
  const allowed = role === 'founder' || role === 'admin';
  const [status, setStatus] = useState<BusinessDiagnosisStatus | null>(null);
  const [answers, setAnswers] = useState<BusinessDiagnosisAnswers>({});
  const [dynamicQuestions, setDynamicQuestions] = useState<BusinessDiagnosisDynamicQuestion[]>([]);
  const [dynamicAnswers, setDynamicAnswers] = useState<BusinessDiagnosisAnswers>({});
  const [step, setStep] = useState<'profile' | 'sector' | 'followups' | 'generating'>('profile');
  const [error, setError] = useState<string | null>(null);
  const [replacement, setReplacement] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (!loading && !allowed) navigate('/overview', { replace: true }); }, [allowed, loading, navigate]);
  useEffect(() => {
    if (!allowed) return;
    fetchBusinessDiagnosis().then(setStatus).catch(() => setError('We could not load the diagnosis right now. Please try again.'));
  }, [allowed]);
  useEffect(() => { if (company?.name && !answers.business_name) setAnswers((current) => ({ ...current, business_name: company.name })); }, [company?.name, answers.business_name]);

  const sectorQuestions = useMemo(() => answers.sector ? businessDiagnosisQuestionsForSector(String(answers.sector)) : [], [answers.sector]);
  const complete = status?.status === 'completed' && !replacement;
  const valid = (questions: readonly (BusinessDiagnosisQuestion | BusinessDiagnosisDynamicQuestion)[], source: BusinessDiagnosisAnswers) => questions.every((question) => {
    const value = source[question.id]; return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '';
  });
  const replacementRequest = replacement && status?.status === 'completed' ? { expectedCompletedAt: status.completedAt } : undefined;
  const requestFollowups = async () => { setError(null); try { const result = await fetchBusinessDiagnosisFollowUps(answers, replacementRequest); setDynamicQuestions(result.questions); setStep('followups'); } catch (requestError) { if (String(requestError).includes('diagnosis_changed')) { const current = await fetchBusinessDiagnosis(); setStatus(current); setReplacement(false); setError('A newer diagnosis is already current. We restored it for you.'); return; } setError('We could not prepare follow-up questions. Please review your answers and try again.'); } };
  const submit = async () => { setError(null); setStep('generating'); try { const result = await completeBusinessDiagnosis(answers, dynamicQuestions, dynamicAnswers, replacementRequest); setStatus(result); setReplacement(false); } catch (requestError) { if (String(requestError).includes('diagnosis_changed')) { const current = await fetchBusinessDiagnosis(); setStatus(current); setReplacement(false); setError('A newer diagnosis was saved while you were working. We restored it for you.'); return; } setStep('followups'); setError('We could not generate the diagnosis. Nothing was saved; you can try again.'); } };
  const restart = () => { const priorAnswers = replacement && status?.status === 'completed' ? status.answers : (company?.name ? { business_name: company.name } : {}); setAnswers(priorAnswers); setDynamicQuestions([]); setDynamicAnswers({}); setStep('profile'); setError(null); };
  const beginReplacement = () => { if (status?.status !== 'completed') return; setAnswers(status.answers); setDynamicQuestions([]); setDynamicAnswers({}); setReplacement(true); setConfirmReplacement(false); setStep('profile'); setError(null); };
  const exportExcel = async () => {
    setError(null); setExporting(true);
    try {
      const blob = await downloadBusinessDiagnosisExcel();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'business-diagnosis.xlsx'; link.click();
      URL.revokeObjectURL(url);
    } catch (_error) {
      setError('We could not export the diagnosis right now. Please try again.');
    } finally { setExporting(false); }
  };

  if (loading || !allowed || (!status && !error)) return <div style={{ color: '#fff', padding: 40 }}><Loader2 className="animate-spin" /></div>;
  return <div style={{ maxWidth: 900, margin: '0 auto', paddingBottom: 40 }}>
    <button onClick={() => navigate('/overview')} style={{ background: 'none', border: 0, color: accent, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}><ArrowLeft size={16} /> Back to Home</button>
    <header style={{ marginBottom: 24 }}><div style={{ color: accent, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700, display: 'flex', gap: 7, alignItems: 'center' }}><ClipboardCheck size={15} /> Founder/Admin insight</div><h1 style={{ color: '#fff', fontSize: 32, margin: '8px 0' }}>Business Diagnosis</h1><p style={{ color: 'rgba(255,255,255,.6)', margin: 0 }}>A practical diagnosis tailored to your business. Your answers are used only to generate the current report.</p></header>
    {error && <div style={{ ...panel, color: '#fecaca', borderColor: 'rgba(248,113,113,.4)', marginBottom: 18, display: 'flex', gap: 9 }}><ShieldAlert size={18} /> {error}</div>}
    {complete ? <><div style={{ ...panel, marginBottom: 18, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><CheckCircle2 color="#86efac" /><div><strong style={{ color: '#fff' }}>Completed {new Date(status.completedAt).toLocaleDateString()}</strong><div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13 }}>Download the current diagnosis or run a new one whenever your business context changes.</div></div></div><div style={{ display: 'flex', gap: 10 }}><button onClick={exportExcel} disabled={exporting} style={{ ...secondaryStyle, opacity: exporting ? .65 : 1 }}>{exporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />} {exporting ? 'Preparing Excel…' : 'Export to Excel'}</button><button onClick={() => setConfirmReplacement(true)} style={secondaryStyle}><RefreshCw size={15} /> New diagnosis</button></div></div>{confirmReplacement && <div style={{ ...panel, marginBottom: 18, borderColor: 'rgba(193,174,255,.45)' }}><strong style={{ color: '#fff' }}>Start a new diagnosis?</strong><p style={body}>Your current diagnosis stays available while you complete this questionnaire. It is permanently replaced only after a new report is successfully generated.</p><div style={{ display: 'flex', gap: 10 }}><button onClick={beginReplacement} style={primaryStyle}>Start new diagnosis</button><button onClick={() => setConfirmReplacement(false)} style={secondaryStyle}>Keep current</button></div></div>}<Report report={status.report} /></> : <section style={panel}>
      {replacement && <div style={{ ...panel, marginBottom: 18, borderColor: 'rgba(193,174,255,.45)', padding: 16 }}><strong style={{ color: '#fff' }}>Creating a replacement diagnosis</strong><p style={{ ...body, marginBottom: 0 }}>Your current diagnosis remains available until this new report is saved. Your prior answers are prefilled below and can all be changed.</p></div>}
      {step === 'profile' && <><h2 style={heading}>Business profile</h2>{BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS.map((question) => <Question key={question.id} question={question} answers={answers} setAnswers={setAnswers} />)}<button disabled={!valid(BUSINESS_DIAGNOSIS_PROFILE_QUESTIONS, answers)} onClick={() => setStep('sector')} style={primaryStyle}>Continue</button></>}
      {step === 'sector' && <><h2 style={heading}>Your business context</h2>{sectorQuestions.map((question) => <Question key={question.id} question={question} answers={answers} setAnswers={setAnswers} />)}<div style={{ display: 'flex', gap: 10 }}><button onClick={() => setStep('profile')} style={secondaryStyle}>Back</button><button disabled={!valid(sectorQuestions, answers)} onClick={requestFollowups} style={primaryStyle}>Prepare targeted questions</button></div></>}
      {step === 'followups' && <><h2 style={heading}>Specific challenges</h2><p style={body}>These questions help identify the root causes behind your stated challenges.</p>{dynamicQuestions.map((question) => <Question key={question.id} question={question} answers={dynamicAnswers} setAnswers={setDynamicAnswers} />)}<div style={{ display: 'flex', gap: 10 }}><button onClick={restart} style={secondaryStyle}><RefreshCw size={15} /> Start over</button><button disabled={!valid(dynamicQuestions, dynamicAnswers)} onClick={submit} style={primaryStyle}>Generate diagnosis</button></div></>}
      {step === 'generating' && <div style={{ padding: 34, textAlign: 'center', color: '#fff' }}><Bot size={32} color={accent} style={{ marginBottom: 12 }} /><h2>Creating your diagnosis</h2><p style={body}>This may take a moment. Please keep this page open.</p></div>}
    </section>}
  </div>;
}
const primaryStyle: React.CSSProperties = { display: 'inline-flex', gap: 7, alignItems: 'center', padding: '10px 15px', border: 0, borderRadius: 9, cursor: 'pointer', background: accent, color: '#18151f', fontWeight: 700 };
const secondaryStyle: React.CSSProperties = { display: 'inline-flex', gap: 7, alignItems: 'center', padding: '10px 15px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 9, cursor: 'pointer', background: 'transparent', color: '#fff', fontWeight: 600 };
