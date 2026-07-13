import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, RefreshCw, Unplug, ExternalLink,
  AlertTriangle, Wifi, TrendingUp, TrendingDown,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import type { Integration } from '../types';
import type { IntegrationConnection, IntegrationMetrics, MetaAdAccountOption } from '../lib/integrations/types';
import {
  LIVE_SUPPORTED, connectStripe, connectOAuth, connectRazorpay, connectHubSpot,
  connectJira, connectSlack,
  disconnectIntegration, fetchMetrics, finalizeMetaAdAccount,
  checkMetaSandboxAvailable, connectMetaSandbox,
} from '../lib/integrations/service';

interface Props {
  integration: Integration;
  connection: IntegrationConnection | null;
  onClose: () => void;
  onConnectionChange: () => void;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtTime(s: number) {
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (d < 1)  return 'just now';
  if (d < 60) return `${d}m ago`;
  return `${Math.floor(d / 60)}h ago`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, trend }: {
  label: string; value: string; sub?: string; trend?: 'up' | 'down';
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
      {sub && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-500'}`}>
          {trend === 'up' && <TrendingUp className="w-3 h-3" />}
          {trend === 'down' && <TrendingDown className="w-3 h-3" />}
          <span>{sub}</span>
        </div>
      )}
    </div>
  );
}

// ─── Metrics panels ───────────────────────────────────────────────────────────

function StripePanel({ data }: { data: Extract<IntegrationMetrics, { type: 'stripe' }>['data'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="MRR"         value={fmt$(data.mrr)}              sub={`+${data.mrrGrowth}% MoM`} trend="up" />
        <Stat label="ARR"         value={fmt$(data.arr)} />
        <Stat label="Subscribers" value={fmtNum(data.activeSubscribers)} sub="active" />
        <Stat label="Churn"       value={`${data.churnRate}%`}         sub="monthly" trend="down" />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">MRR trend (6 months)</p>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data.mrrHistory}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmt$(Number(v ?? 0)), 'MRR']} />
            <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent transactions</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentTransactions.map((tx) => (
                <tr key={tx.id} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-gray-300">{tx.customer}</td>
                  <td className="px-3 py-2 text-white font-medium">${tx.amount}</td>
                  <td className="px-3 py-2 text-gray-500">{tx.date}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      tx.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' :
                      tx.status === 'failed'    ? 'bg-red-500/10 text-red-400' :
                                                  'bg-amber-500/10 text-amber-400'
                    }`}>{tx.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GAPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'google-analytics' }>['data'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Sessions (30d)"   value={fmtNum(data.sessions30d)}  sub="total visits" />
        <Stat label="Users (30d)"      value={fmtNum(data.users30d)} />
        <Stat label="Bounce Rate"      value={`${data.bounceRate}%`}      trend="down" />
        <Stat label="Conversion"       value={`${data.conversionRate}%`}  sub="signup rate" trend="up" />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Sessions trend (6 months)</p>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data.sessionsHistory}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v)} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Traffic channels</p>
          <div className="space-y-2">
            {data.topChannels.map((c) => (
              <div key={c.channel}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-400">{c.channel}</span>
                  <span className="text-gray-500">{c.pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-2">Top pages (30d)</p>
          <div className="space-y-1.5">
            {data.topPages.map((p) => (
              <div key={p.page} className="flex justify-between text-xs">
                <span className="text-gray-400 font-mono truncate">{p.page}</span>
                <span className="text-gray-300 ml-2">{fmtNum(p.views)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">Avg session: {fmtTime(data.avgSessionDuration)}</p>
        </div>
      </div>
    </div>
  );
}

function MetaPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'meta-ads' }>['data'] }) {
  const colors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b'];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Ad Spend (30d)" value={fmt$(data.spend30d)} />
        <Stat label="ROAS"           value={`${data.roas}x`}         sub="return on ad spend" trend="up" />
        <Stat label="CPA"            value={data.cpa == null ? 'No conversions' : `${data.currency} ${data.cpa}`} sub="per selected conversion" />
        <Stat label="Conversions"    value={String(data.conversions30d)} sub={`CTR ${data.ctr}%`} trend="up" />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Campaign spend breakdown</p>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data.topCampaigns} margin={{ left: -20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt$(v)} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmt$(Number(v ?? 0)), 'Spend']} />
            <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
              {data.topCampaigns.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Impressions (30d)" value={fmtNum(data.impressions30d)} />
        <Stat label="Clicks (30d)"      value={fmtNum(data.clicks30d)} />
        <Stat label="CPC"               value={`${data.currency} ${data.cpc}`} />
      </div>
    </div>
  );
}

function RazorpayPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'razorpay' }>['data'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label={`Volume 30d (${data.currency})`} value={fmtNum(data.paymentVolume30d)}  sub={`${data.totalTransactions30d} txns`} />
        <Stat label="Success Rate"   value={`${data.successRate}%`}    sub={`${data.failedCount30d} failed`} trend={data.successRate >= 90 ? 'up' : 'down'} />
        <Stat label="Avg Order Value" value={`${data.currency} ${fmtNum(data.avgOrderValue)}`} />
        <Stat label="Active Subs"    value={String(data.activeSubscriptions)} sub="subscriptions" />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Payment volume trend (6 months · {data.currency})</p>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data.paymentHistory}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v)} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent payments</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.map((p) => (
                <tr key={p.id} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-gray-500 font-mono">{p.id.slice(-8)}</td>
                  <td className="px-3 py-2 text-white font-medium">{p.currency} {p.amount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-gray-400 capitalize">{p.method}</td>
                  <td className="px-3 py-2 text-gray-500">{p.date}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      p.status === 'captured'  ? 'bg-emerald-500/10 text-emerald-400' :
                      p.status === 'failed'    ? 'bg-red-500/10 text-red-400' :
                      p.status === 'refunded'  ? 'bg-amber-500/10 text-amber-400' :
                                                 'bg-gray-500/10 text-gray-400'
                    }`}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalesforcePanel({ data }: { data: Extract<IntegrationMetrics, { type: 'salesforce' }>['data'] }) {
  const maxVal = Math.max(...data.stageBreakdown.map((s) => s.value), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Open Pipeline"   value={fmt$(data.openPipelineValue)}  sub={`${data.openDealsCount} deals`} />
        <Stat label="Win Rate"        value={`${data.winRate}%`}            sub="last 90 days" trend={data.winRate >= 30 ? 'up' : 'down'} />
        <Stat label="Avg Cycle Time"  value={`${data.avgDealCycleTime}d`}   sub="to close" />
        <Stat label="Pipeline Velocity" value={fmt$(data.pipelineVelocity)} sub="per day" trend="up" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Pipeline by stage</p>
          <div className="space-y-2">
            {data.stageBreakdown.map((s) => (
              <div key={s.stage}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-400 truncate max-w-[140px]">{s.stage}</span>
                  <span className="text-gray-500 ml-2">{fmt$(s.value)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(s.value / maxVal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Won this quarter</p>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-2">
            <p className="text-2xl font-semibold text-white">{fmt$(data.closedWonValue90d)}</p>
            <p className="text-xs text-emerald-400">{data.closedWonCount90d} deals closed</p>
            <p className="text-[11px] text-gray-600 mt-1">last 90 days</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent deals</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Close Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentDeals.map((d, i) => (
                <tr key={i} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-gray-300 max-w-[160px] truncate">{d.name}</td>
                  <td className="px-3 py-2 text-white font-medium">{fmt$(d.amount)}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[120px]">{d.stage}</td>
                  <td className="px-3 py-2 text-gray-500">{d.closeDate}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      d.status === 'won'  ? 'bg-emerald-500/10 text-emerald-400' :
                      d.status === 'lost' ? 'bg-red-500/10 text-red-400' :
                                            'bg-sky-500/10 text-sky-400'
                    }`}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HubSpotPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'hubspot' }>['data'] }) {
  const maxVal = Math.max(...data.dealsByStage.map((s) => s.value), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Total Contacts"  value={fmtNum(data.totalContacts)}     sub={`+${data.newContacts30d} this month`} trend="up" />
        <Stat label="Open Deals"      value={String(data.openDealsCount)}    sub="in pipeline" />
        <Stat label="Pipeline Value"  value={fmt$(data.pipelineValue)}       sub={`avg ${fmt$(data.avgDealValue)}`} />
        <Stat label="Closed Won (30d)" value={fmt$(data.closedWonValue30d)} sub={`${data.closedWonCount30d} deals`} trend="up" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Pipeline by stage</p>
          <div className="space-y-2">
            {data.dealsByStage.map((s) => (
              <div key={s.stage}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-gray-400 truncate max-w-[140px] capitalize">{s.stage.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                  <span className="text-gray-500 ml-2">{fmt$(s.value)}</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${(s.value / maxVal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2">Won this month</p>
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-2">
            <p className="text-2xl font-semibold text-white">{fmt$(data.closedWonValue30d)}</p>
            <p className="text-xs text-emerald-400">{data.closedWonCount30d} deals closed</p>
            <p className="text-[11px] text-gray-600 mt-1">last 30 days</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent deals</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Close Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentDeals.map((d) => (
                <tr key={d.id} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-gray-300 max-w-[160px] truncate">{d.name}</td>
                  <td className="px-3 py-2 text-white font-medium">{fmt$(d.amount)}</td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[120px] capitalize">{d.stage.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>
                  <td className="px-3 py-2 text-gray-500">{d.closeDate}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      d.status === 'won'  ? 'bg-emerald-500/10 text-emerald-400' :
                      d.status === 'lost' ? 'bg-red-500/10 text-red-400' :
                                            'bg-sky-500/10 text-sky-400'
                    }`}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QuickBooksPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'quickbooks' }>['data'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Revenue (30d)"   value={fmt$(data.revenue30d)}          sub="gross income" trend="up" />
        <Stat label="Expenses (30d)"  value={fmt$(data.expenses30d)} />
        <Stat label="Net Income"      value={fmt$(data.netIncome30d)}         trend={data.netIncome30d >= 0 ? 'up' : 'down'} />
        <Stat label="Outstanding"     value={fmt$(data.outstandingAmount)}    sub={`${data.outstandingInvoices} invoices`} />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Revenue trend (6 months)</p>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data.revenueHistory}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmt$(Number(v ?? 0)), 'Revenue']} />
            <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent invoices</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-gray-500 font-mono">{inv.id}</td>
                  <td className="px-3 py-2 text-gray-300">{inv.customer}</td>
                  <td className="px-3 py-2 text-white font-medium">{fmt$(inv.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{inv.date}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      inv.status === 'paid'    ? 'bg-emerald-500/10 text-emerald-400' :
                      inv.status === 'overdue' ? 'bg-red-500/10 text-red-400' :
                                                 'bg-amber-500/10 text-amber-400'
                    }`}>{inv.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Jira panel ───────────────────────────────────────────────────────────────

function JiraPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'jira' }>['data'] }) {
  const sprintPct = data.activeSprintTotal > 0
    ? Math.round((data.activeSprintDone / data.activeSprintTotal) * 100)
    : 0;
  const typeColors = ['#0ea5e9', '#8b5cf6', '#ef4444', '#f59e0b'];
  const prioColors: Record<string, string> = {
    Highest: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e', Lowest: '#6b7280',
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Open Issues"     value={String(data.totalOpenIssues)}  sub="to-do + in-progress" />
        <Stat label="In Progress"     value={String(data.inProgressIssues)} sub="active now" trend="up" />
        <Stat label="Resolved (30d)"  value={String(data.resolvedLast30d)}  sub="last 30 days" trend="up" />
        <Stat label="Open Bugs"       value={String(data.openBugs)}         sub="unresolved" trend={data.openBugs > 10 ? 'down' : undefined} />
      </div>

      {data.activeSprintName && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs text-gray-400 font-medium">{data.activeSprintName}</p>
            <span className="text-xs text-sky-400">{sprintPct}% complete</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${sprintPct}%` }} />
          </div>
          <p className="text-[11px] text-gray-600 mt-1.5">{data.activeSprintDone} of {data.activeSprintTotal} issues done</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Issues by type</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={data.issuesByType} layout="vertical" margin={{ left: -10, right: 10 }}>
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.issuesByType.map((_, i) => <Cell key={i} fill={typeColors[i % typeColors.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-2">Issues by priority</p>
          <div className="space-y-2">
            {data.issuesByPriority.map((p) => (
              <div key={p.priority} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: prioColors[p.priority] ?? '#6b7280' }} />
                <span className="text-xs text-gray-400 flex-1">{p.priority}</span>
                <span className="text-xs text-gray-300 font-medium">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Recent issues</p>
        <div className="rounded-lg overflow-hidden border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80 text-gray-500 text-left">
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {data.recentIssues.map((issue) => (
                <tr key={issue.key} className="border-t border-gray-800/60">
                  <td className="px-3 py-2 text-sky-400 font-mono font-medium">{issue.key}</td>
                  <td className="px-3 py-2 text-gray-300 max-w-[200px] truncate">{issue.summary}</td>
                  <td className="px-3 py-2 text-gray-500">{issue.type}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: prioColors[issue.priority] ?? '#6b7280' }} />
                      <span className="text-gray-400">{issue.priority}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                      issue.status === 'Done'        ? 'bg-emerald-500/10 text-emerald-400' :
                      issue.status === 'In Progress' ? 'bg-sky-500/10 text-sky-400' :
                                                       'bg-gray-500/10 text-gray-400'
                    }`}>{issue.status}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">{issue.assignee ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Slack panel ──────────────────────────────────────────────────────────────

function SlackPanel({ data }: { data: Extract<IntegrationMetrics, { type: 'slack' }>['data'] }) {
  const maxMembers = Math.max(...data.topChannels.map((c) => c.memberCount), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Members"          value={String(data.totalMembers)}    sub="workspace members" />
        <Stat label="Total Channels"   value={String(data.totalChannels)}   sub={`${data.publicChannels} public`} />
        <Stat label="Private Channels" value={String(data.privateChannels)} />
        <Stat label="Workspace"        value={data.workspaceDomain ? `${data.workspaceDomain}.slack.com` : data.workspaceName} />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Top channels by members</p>
        <div className="space-y-2.5">
          {data.topChannels.map((ch) => (
            <div key={ch.name}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-400 font-medium">#{ch.name}</span>
                  {ch.isPrivate && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-500">private</span>
                  )}
                </div>
                <span className="text-gray-500">{ch.memberCount} members</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(ch.memberCount / maxMembers) * 100}%`,
                    background: ch.isPrivate ? '#8b5cf6' : '#22d3ee',
                  }}
                />
              </div>
              {ch.topic && (
                <p className="text-[10px] text-gray-600 mt-0.5 truncate">{ch.topic}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Public</p>
          <p className="text-2xl font-semibold text-white">{data.publicChannels}</p>
          <p className="text-xs text-cyan-400 mt-1">open channels</p>
        </div>
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Private</p>
          <p className="text-2xl font-semibold text-white">{data.privateChannels}</p>
          <p className="text-xs text-violet-400 mt-1">private channels</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function IntegrationModal({ integration, connection: initialConn, onClose, onConnectionChange }: Props) {
  const [conn, setConn]           = useState<IntegrationConnection | null>(initialConn);
  const [metrics, setMetrics]     = useState<IntegrationMetrics | null>(null);
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [loadingMetrics, setLM]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [rzpForm, setRzpForm]         = useState({ keyId: '', keySecret: '' });
  const [stripeKey, setStripeKey]     = useState('');
  const [hubspotToken, setHubspotToken] = useState('');
  const [jiraForm, setJiraForm]       = useState({ domain: '', email: '', apiToken: '' });
  const [slackToken, setSlackToken]   = useState('');
  const [metaAccountChoice, setMetaAccountChoice] = useState<{ accounts: MetaAdAccountOption[]; ticket: string } | null>(null);
  const [selectingAccount, setSelectingAccount]   = useState(false);
  const [sandboxAvailable, setSandboxAvailable]   = useState(false);
  const backdropRef               = useRef<HTMLDivElement>(null);
  const isLive                    = LIVE_SUPPORTED.has(integration.id);

  // Load metrics when connected
  useEffect(() => {
    if (!conn) return;
    setLM(true);
    setError(null);
    fetchMetrics(integration.id)
      .then(setMetrics)
      .catch((e) => setError(String(e).replace('Error: ', '')))
      .finally(() => setLM(false));
  }, [conn, integration.id]);

  // Dev-only: is the sandbox connect available for this user? (Meta, when unconnected)
  useEffect(() => {
    if (conn || integration.id !== 'int-meta') return;
    let active = true;
    checkMetaSandboxAvailable().then((ok) => { if (active) setSandboxAvailable(ok); });
    return () => { active = false; };
  }, [conn, integration.id]);

  // Close on ESC
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      let result: IntegrationConnection | { needsSelection: true; accounts: MetaAdAccountOption[]; ticket: string };
      if (integration.id === 'int-stripe') {
        if (!stripeKey.trim()) {
          setError('Please enter your Stripe secret key.');
          setLoading(false);
          return;
        }
        result = await connectStripe(stripeKey.trim());
      } else if (integration.id === 'int-razorpay') {
        if (!rzpForm.keyId.trim() || !rzpForm.keySecret.trim()) {
          setError('Please enter both your Razorpay Key ID and Key Secret.');
          setLoading(false);
          return;
        }
        result = await connectRazorpay(rzpForm.keyId.trim(), rzpForm.keySecret.trim());
      } else if (integration.id === 'int-hubspot') {
        if (!hubspotToken.trim()) {
          setError('Please enter your HubSpot Private App token.');
          setLoading(false);
          return;
        }
        result = await connectHubSpot(hubspotToken.trim());
      } else if (integration.id === 'int-jira') {
        if (!jiraForm.domain.trim() || !jiraForm.email.trim() || !jiraForm.apiToken.trim()) {
          setError('Please fill in all three Jira fields.');
          setLoading(false);
          return;
        }
        result = await connectJira(jiraForm.domain.trim(), jiraForm.email.trim(), jiraForm.apiToken.trim());
      } else if (integration.id === 'int-slack') {
        if (!slackToken.trim()) {
          setError('Please enter your Slack Bot token.');
          setLoading(false);
          return;
        }
        result = await connectSlack(slackToken.trim());
      } else {
        result = await connectOAuth(integration.id);
      }
      if ('needsSelection' in result) {
        setMetaAccountChoice({ accounts: result.accounts, ticket: result.ticket });
        return;
      }
      setConn(result);
      onConnectionChange();
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectSandbox() {
    setLoading(true);
    setError(null);
    try {
      const result = await connectMetaSandbox();
      setConn(result);
      onConnectionChange();
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAdAccount(accountId: string) {
    if (!metaAccountChoice) return;
    setSelectingAccount(true);
    setError(null);
    try {
      const result = await finalizeMetaAdAccount(metaAccountChoice.ticket, accountId);
      setConn(result);
      setMetaAccountChoice(null);
      onConnectionChange();
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    } finally {
      setSelectingAccount(false);
    }
  }

  async function handleSync() {
    if (!conn) return;
    setSyncing(true);
    setError(null);
    try {
      const m = await fetchMetrics(integration.id);
      setMetrics(m);
      setConn({ ...conn, lastSynced: new Date().toISOString() });
    } catch (e) {
      setError(String(e).replace('Error: ', ''));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectIntegration(integration.id);
    } catch { /* best effort */ }
    setConn(null);
    setMetrics(null);
    onConnectionChange();
  }

  const modal = (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700/80"
        style={{ background: '#0d1829' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-800 sticky top-0 z-10"
          style={{ background: '#0d1829' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">{integrationEmoji(integration.id)}</span>
            <div>
              <h2 className="text-sm font-semibold text-white">{integration.name}</h2>
              {conn && <p className="text-[11px] text-gray-500">{conn.accountName}</p>}
            </div>
            {conn && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 ml-1">
                <Wifi className="w-2.5 h-2.5" /> Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {conn && (
              <>
                <span className="text-[11px] text-gray-500">Synced {timeAgo(conn.lastSynced)}</span>
                <button onClick={handleSync} disabled={syncing} title="Sync now"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={handleDisconnect} title="Disconnect"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                  <Unplug className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {metaAccountChoice ? (
            /* ── Meta Ads: choose which ad account to connect ── */
            <div className="flex flex-col items-center text-center py-4 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">
                {integrationEmoji(integration.id)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Choose an ad account</h3>
                <p className="text-sm text-gray-400 mt-1">Your Facebook login has access to multiple ad accounts. Pick the one to connect.</p>
              </div>
              <div className="w-full space-y-2">
                {metaAccountChoice.accounts.map((acct) => (
                  <button
                    key={acct.id}
                    onClick={() => handleSelectAdAccount(acct.id)}
                    disabled={selectingAccount}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-900/60 border border-gray-800 hover:border-sky-500 rounded-xl text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{acct.name}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{acct.id} · {acct.currency}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      acct.accountStatus === 1
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-gray-700/40 border border-gray-600/40 text-gray-400'
                    }`}>
                      {acct.accountStatus === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                ))}
              </div>
              {selectingAccount && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Connecting…
                </p>
              )}
            </div>
          ) : !conn ? (
            /* ── Not connected ── */
            <div className="flex flex-col items-center text-center py-4 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">
                {integrationEmoji(integration.id)}
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{integration.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{integration.description}</p>
              </div>

              {!isLive ? (
                <div className="w-full bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-sm text-gray-400">
                  Live connection coming soon. Stay tuned.
                </div>
              ) : integration.id === 'int-stripe' ? (
                <div className="w-full space-y-3">
                  <input
                    type="password"
                    placeholder="Secret key  (sk_test_… or sk_live_…)"
                    value={stripeKey}
                    onChange={(e) => setStripeKey(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-600">
                    Find your key in the Stripe Dashboard → Developers → API keys.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect with Stripe</>}
                  </button>
                </div>
              ) : integration.id === 'int-hubspot' ? (
                <div className="w-full space-y-3">
                  <input
                    type="password"
                    placeholder="Private App token  (pat-na1-…)"
                    value={hubspotToken}
                    onChange={(e) => setHubspotToken(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-600">
                    Find your token in HubSpot → Settings → Integrations → Private Apps.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect HubSpot</>}
                  </button>
                </div>
              ) : integration.id === 'int-razorpay' ? (
                <div className="w-full space-y-3">
                  <input
                    type="text"
                    placeholder="Key ID  (rzp_test_… or rzp_live_…)"
                    value={rzpForm.keyId}
                    onChange={(e) => setRzpForm((f) => ({ ...f, keyId: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <input
                    type="password"
                    placeholder="Key Secret"
                    value={rzpForm.keySecret}
                    onChange={(e) => setRzpForm((f) => ({ ...f, keySecret: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-600">
                    Find your keys in the Razorpay Dashboard → Settings → API Keys.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect Razorpay</>}
                  </button>
                </div>
              ) : integration.id === 'int-jira' ? (
                <div className="w-full space-y-3">
                  <input
                    type="text"
                    placeholder="Domain  (e.g. yourcompany.atlassian.net)"
                    value={jiraForm.domain}
                    onChange={(e) => setJiraForm((f) => ({ ...f, domain: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <input
                    type="email"
                    placeholder="Email  (your Atlassian account email)"
                    value={jiraForm.email}
                    onChange={(e) => setJiraForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <input
                    type="password"
                    placeholder="API Token  (from id.atlassian.com → Security → API tokens)"
                    value={jiraForm.apiToken}
                    onChange={(e) => setJiraForm((f) => ({ ...f, apiToken: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-600">
                    Generate your API token at id.atlassian.com → Manage account → Security → API tokens.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect Jira</>}
                  </button>
                </div>
              ) : integration.id === 'int-slack' ? (
                <div className="w-full space-y-3">
                  <input
                    type="password"
                    placeholder="Bot token  (xoxb-…)"
                    value={slackToken}
                    onChange={(e) => setSlackToken(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 focus:border-sky-500 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none transition-colors"
                  />
                  <p className="text-[11px] text-gray-600">
                    Create a Slack app at api.slack.com/apps, add Bot Token scopes: channels:read, channels:history, team:read, chat:write. Install the app, then copy the Bot User OAuth Token.
                  </p>
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect Slack</>}
                  </button>
                </div>
              ) : (
                <div className="w-full space-y-2">
                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-all"
                  >
                    {loading
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Connecting…</>
                      : <><ExternalLink className="w-4 h-4" /> Connect with {integration.name}</>}
                  </button>
                  {integration.id === 'int-meta' && sandboxAvailable && (
                    <button
                      onClick={handleConnectSandbox}
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 px-5 py-2 border border-gray-700 hover:border-gray-600 disabled:opacity-60 disabled:cursor-not-allowed text-gray-400 hover:text-gray-200 text-xs font-medium rounded-lg transition-all"
                    >
                      Connect sandbox account (dev)
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : loadingMetrics ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
              <p className="text-sm text-gray-400">Loading metrics…</p>
            </div>
          ) : metrics ? (
            <MetricsBody metrics={metrics} />
          ) : (
            <p className="text-center py-10 text-sm text-gray-500">No metrics available.</p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function MetricsBody({ metrics }: { metrics: IntegrationMetrics }) {
  if (metrics.type === 'stripe')           return <StripePanel    data={metrics.data} />;
  if (metrics.type === 'google-analytics') return <GAPanel        data={metrics.data} />;
  if (metrics.type === 'meta-ads')         return <MetaPanel      data={metrics.data} />;
  if (metrics.type === 'razorpay')         return <RazorpayPanel  data={metrics.data} />;
  if (metrics.type === 'salesforce')       return <SalesforcePanel  data={metrics.data} />;
  if (metrics.type === 'hubspot')          return <HubSpotPanel    data={metrics.data} />;
  if (metrics.type === 'quickbooks')       return <QuickBooksPanel data={metrics.data} />;
  if (metrics.type === 'jira')             return <JiraPanel       data={metrics.data} />;
  if (metrics.type === 'slack')            return <SlackPanel      data={metrics.data} />;
  return null;
}

function integrationEmoji(id: string): string {
  const m: Record<string, string> = {
    'int-stripe': '💳', 'int-razorpay': '🔷', 'int-qb': '📊',
    'int-hubspot': '🧡', 'int-sf': '☁️', 'int-mixpanel': '🔵',
    'int-amplitude': '📈', 'int-ga': '📊', 'int-meta': '🎯',
    'int-jira': '🗂️', 'int-linear': '⚡', 'int-slack': '💬',
  };
  return m[id] ?? '🔌';
}
