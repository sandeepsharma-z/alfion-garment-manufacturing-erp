import * as React from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '@/lib/api-base';

/* Buyer tracking portal (M-22): public, read-only, mobile-first, no ERP session. Talks only to /public/track/:token. */
const BASE = `${API_BASE}/public`;
type Stage = { stage: string; status: string; rag: string; planned?: string; actual?: string; done: number; total: number };
type Snap = Full & { id?: string; ref: { buyerPo: string; styleNo: string }; description: string; colour: string; hasImage: boolean; qty: number; shipDate?: string; status: string; progress: number; health: string; stages: Stage[];
  dispatch: { mode: string; status: string; vesselOrFlight: string; blOrAwbNo: string; portOfLoading: string; portOfDischarge: string; eta?: string; events: { title: string; at: string }[] } | null;
  merchandiser: { name: string; email: string; phone: string } };
type PlanRow = { seq: number; activity: string; stage: string; dept: string; owner: string; plannedStart?: string; plannedEnd?: string; actualEnd?: string; status: string; late: boolean; remark: string };
type Full = { photoCount?: number; fabric?: string; sizeRange?: string; poNo?: string; buyerOrderNo?: string; progressPct?: number; cutQty?: number;
  sizes?: { size: string; qty: number }[]; colours?: { code: string; name: string; qty: number; sizes: { size: string; qty: number }[] }[];
  plan?: PlanRow[]; planDone?: number; planTotal?: number;
  production?: { op: string; planned: number; done: number; rejected: number; state: string }[];
  quality?: { stage: string; result: string; date: string; lotSize: number; defects: number }[];
  packing?: { cartons: number; pcs: number } | null;
  shipments?: { invoiceNo: string; date: string; mode: string; status: string; qty: number; cartons: number; grossKg: number; netKg: number; route: string; vesselOrFlight: string; blOrAwbNo: string; eta?: string | null; events: { title: string; at: string }[]; documents: { type: string; status: string }[] }[] };
type Payload = { kind: 'order' | 'buyer'; detail?: 'stages' | 'full'; company: { name: string; email: string; phone: string }; order?: Snap; orders?: Snap[] };
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtN = (n: number) => n.toLocaleString('en-IN');
const RAG: Record<string, string> = { green: '#279e97', amber: '#e0b50f', red: '#c02b3f', done: '#279e97', grey: '#b8bcc8' };
const RAG_LABEL: Record<string, string> = { green: 'On track', amber: 'Due soon', red: 'Delayed', done: 'Completed', grey: '—' };

export default function PortalPage() {
  const { token = '' } = useParams();
  const [pin, setPin] = React.useState('');
  const [needPin, setNeedPin] = React.useState(false);
  const [secret, setSecret] = React.useState<'PIN' | 'PASSWORD'>('PIN');
  const [err, setErr] = React.useState('');
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async (p?: string) => {
    setLoading(true); setErr('');
    try { const r = await axios.get<Payload>(`${BASE}/track/${token}`, { headers: p ? { 'x-pin': p } : {} }); setData(r.data); setNeedPin(false); }
    catch (e) {
      const code = axios.isAxiosError(e) ? (e.response?.data as { code?: string; message?: string }) : undefined;
      if (code?.code && /^(PIN|PASSWORD)_(REQUIRED|WRONG)$/.test(code.code)) {
        const kind = code.code.startsWith('PASSWORD') ? 'PASSWORD' : 'PIN';
        setSecret(kind); setNeedPin(true);
        if (code.code.endsWith('WRONG')) setErr(`Incorrect ${kind === 'PASSWORD' ? 'password' : 'PIN'} — please try again`);
      } else setErr(code?.message || 'This tracking link could not be opened');
    }
    finally { setLoading(false); }
  }, [token]);
  React.useEffect(() => { document.title = 'Order Tracking — Afion International'; load(); }, [load]);
  const img = (order?: string, i = 0) => `${BASE}/track/${token}/image?i=${i}${order ? `&order=${order}` : ''}${pin ? `&pin=${encodeURIComponent(pin)}` : ''}`;

  return (
    <div style={{ minHeight: '100vh', background: '#f6f4f1', color: '#111827', fontFamily: 'Outfit, Segoe UI, system-ui, sans-serif' }}>
      <header style={{ background: '#111827', color: '#fff', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#a05aff,#9e58ff)', display: 'grid', placeItems: 'center', fontWeight: 800, color: '#fff', fontFamily: 'Roboto Slab, serif' }}>AI</div>
        <div><div style={{ fontWeight: 700, fontFamily: 'Roboto Slab, serif', fontSize: 15 }}>{data?.company.name || 'Afion International'}</div><div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.6 }}>Order tracking</div></div>
        <div style={{ marginLeft: 'auto', fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>{token}</div>
      </header>
      <main style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#7a7f8f' }}>Loading your order status…</div>}
        {!loading && needPin && (
          <form onSubmit={(e) => { e.preventDefault(); load(pin); }} style={card()}>
            <h2 style={h2()}>Enter the {secret === 'PASSWORD' ? 'password' : 'PIN'}</h2><p style={{ margin: '4px 0 12px', color: '#7a7f8f', fontSize: 13 }}>This link is protected. Your merchandiser shared the {secret === 'PASSWORD' ? 'password' : 'PIN'} with you.</p>
            {secret === 'PASSWORD'
              ? <input type="password" autoFocus autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value.slice(0, 40))} placeholder="Password" style={{ width: '100%', fontSize: 16, padding: 12, borderRadius: 10, border: '1px solid #d8dbe2', background: '#fff' }} />
              : <input inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" style={{ width: '100%', fontSize: 24, letterSpacing: 8, textAlign: 'center', padding: 10, borderRadius: 10, border: '1px solid #d8dbe2', background: '#fff' }} />}
            {err && <div style={{ color: '#c02b3f', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button type="submit" style={btn()}>Open tracking</button>
          </form>)}
        {!loading && !needPin && err && <div style={card()}><h2 style={h2()}>Link unavailable</h2><p style={{ color: '#7a7f8f', fontSize: 13 }}>{err}. Please ask your merchandiser at {data?.company.name || 'Afion International'} for a new link.</p></div>}
        {!loading && data?.kind === 'order' && data.order && <OrderCard o={data.order} img={img()} imgAt={(i) => img(undefined, i)} company={data.company} />}
        {!loading && data?.kind === 'buyer' && data.orders && (
          <>
            <div style={{ ...card(), padding: 14 }}><h2 style={h2()}>Your live orders</h2><p style={{ margin: 0, color: '#7a7f8f', fontSize: 13 }}>{data.orders.length} order{data.orders.length === 1 ? '' : 's'} in production at {data.company.name}</p></div>
            {data.orders.map((o) => <OrderCard key={o.id} o={o} img={img(o.id)} imgAt={(i) => img(o.id, i)} company={data.company} compact />)}
            {!data.orders.length && <div style={card()}><p style={{ color: '#7a7f8f' }}>No live orders right now.</p></div>}
          </>)}
        <footer style={{ textAlign: 'center', fontSize: 11, color: '#9aa0ad', padding: '20px 0' }}>Live status from Afion ERP · read-only · {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</footer>
      </main>
    </div>
  );
}

const card = (): React.CSSProperties => ({ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 8px 24px -14px rgba(30,30,44,.18)', border: '1px solid #ebe8e3' });
const h2 = (): React.CSSProperties => ({ fontFamily: 'Roboto Slab, serif', fontSize: 17, margin: 0 });
const btn = (): React.CSSProperties => ({ marginTop: 12, width: '100%', padding: 12, borderRadius: 10, border: 0, background: 'linear-gradient(135deg,#a05aff,#9e58ff)', color: '#fff', fontWeight: 700, fontSize: 14 });
const pill = (bg: string, fg = '#fff'): React.CSSProperties => ({ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: fg });

function OrderCard({ o, img, imgAt, company, compact }: { o: Snap; img: string; imgAt?: (i: number) => string; company: { name: string; email: string; phone: string }; compact?: boolean }) {
  const [open, setOpen] = React.useState(!compact);
  const [imgOk, setImgOk] = React.useState(o.hasImage || !!o.photoCount);
  const [shot, setShot] = React.useState(0);
  const full = !!o.plan;
  return (
    <div style={card()}>
      <div style={{ display: 'flex', gap: 14 }}>
        {imgOk && <div>
          <img src={imgAt ? imgAt(shot) : img} alt="" onError={() => setImgOk(false)} style={{ width: 96, height: 120, objectFit: 'cover', borderRadius: 10, background: '#f0eee9' }} />
          {(o.photoCount || 0) > 1 && <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>{Array.from({ length: Math.min(o.photoCount || 0, 5) }, (_, i) => (
            <button key={i} type="button" onClick={() => setShot(i)} style={{ width: 9, height: 9, borderRadius: 999, border: 0, background: i === shot ? '#a05aff' : '#d9d5cf', padding: 0 }} aria-label={`photo ${i + 1}`} />))}</div>}
        </div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#7a7f8f', textTransform: 'uppercase', letterSpacing: 1 }}>PO {o.ref.buyerPo || '—'} · Style {o.ref.styleNo}</div>
          <h2 style={{ ...h2(), marginTop: 2 }}>{o.description}</h2>
          <div style={{ fontSize: 13, color: '#5f6472', marginTop: 4 }}>{o.colour ? `${o.colour} · ` : ''}{fmtN(o.qty)} pcs · ship {fmtD(o.shipDate)}{o.fabric ? ` · ${o.fabric}` : ''}{o.poNo ? ` · PO ${o.poNo}` : ''}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span style={pill('#111827')}>{o.status}</span><span style={pill(RAG[o.health] || '#b8bcc8')}>{RAG_LABEL[o.health] || 'Planned'}</span><span style={{ fontSize: 12, color: '#7a7f8f' }}>{o.progress}% complete</span></div>
        </div>
      </div>
      <div style={{ height: 8, background: '#eeece7', borderRadius: 999, marginTop: 12, overflow: 'hidden' }}><div style={{ width: `${Math.min(o.progress, 100)}%`, height: '100%', background: 'linear-gradient(90deg,#a05aff,#1bcfb4)', borderRadius: 999 }} /></div>
      {compact && <button onClick={() => setOpen(!open)} style={{ ...btn(), background: '#f3f1ec', color: '#111827', marginTop: 10 }}>{open ? 'Hide stages' : 'Show stages'}</button>}
      {open && (
        <>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {o.stages.map((s) => (
              <div key={s.stage} style={{ border: '1px solid #ebe8e3', borderLeft: `4px solid ${RAG[s.rag] || '#b8bcc8'}`, borderRadius: 10, padding: '8px 10px', background: s.rag === 'done' ? '#f1faf9' : '#fff' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.stage}</div>
                <div style={{ fontSize: 11.5, color: RAG[s.rag] === '#b8bcc8' ? '#9aa0ad' : RAG[s.rag], fontWeight: 600 }}>{s.status}{s.total ? ` · ${s.done}/${s.total}` : ''}</div>
                <div style={{ fontSize: 10.5, color: '#7a7f8f', marginTop: 2 }}>Plan {fmtD(s.planned)}{s.actual ? ` · Done ${fmtD(s.actual)}` : ''}</div>
              </div>))}
          </div>
          {full && <FullBlocks o={o} />}
          {o.dispatch && !o.shipments?.length && (
            <div style={{ marginTop: 14, borderRadius: 12, background: '#f7f5f0', padding: 12 }}>
              <div style={{ fontSize: 11, color: '#7a7f8f', textTransform: 'uppercase', letterSpacing: 1 }}>Shipment · {o.dispatch.mode} · {o.dispatch.status}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{o.dispatch.portOfLoading} → {o.dispatch.portOfDischarge}{o.dispatch.vesselOrFlight ? ` · ${o.dispatch.vesselOrFlight}` : ''}{o.dispatch.blOrAwbNo ? ` · ${o.dispatch.mode === 'Air' ? 'AWB' : 'B/L'} ${o.dispatch.blOrAwbNo}` : ''}{o.dispatch.eta ? ` · ETA ${fmtD(o.dispatch.eta)}` : ''}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#5f6472' }}>{o.dispatch.events.map((e) => `${e.title} (${fmtD(e.at)})`).join(' → ')}</div>
            </div>)}
          <div style={{ marginTop: 14, fontSize: 12.5, color: '#5f6472', borderTop: '1px solid #ebe8e3', paddingTop: 10 }}>Your merchandiser: <b>{o.merchandiser.name}</b>{o.merchandiser.email ? ` · ${o.merchandiser.email}` : ''}{o.merchandiser.phone ? ` · ${o.merchandiser.phone}` : ''}{!o.merchandiser.email && company.email ? ` · ${company.email}` : ''}</div>
        </>)}
    </div>
  );
}

/* ---------- everything else the buyer may see when the link is shared as "full T&A plan" ---------- */
const sec = (): React.CSSProperties => ({ marginTop: 14, border: '1px solid #ebe8e3', borderRadius: 12, overflow: 'hidden' });
const secHead = (): React.CSSProperties => ({ background: '#f7f5f0', padding: '7px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#7a7f8f' });
const th = (): React.CSSProperties => ({ textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#7a7f8f', padding: '6px 8px', borderBottom: '1px solid #ebe8e3', whiteSpace: 'nowrap' });
const td = (): React.CSSProperties => ({ fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #f2efea', verticalAlign: 'top' });

function FullBlocks({ o }: { o: Snap }) {
  const plan = o.plan || [];
  const [allRows, setAllRows] = React.useState(false);
  const rows = allRows ? plan : plan.slice(0, 12);
  const grid = o.colours?.length ? o.colours : null;
  const sizes = o.sizes?.length ? o.sizes : null;
  return (
    <>
      {/* the plan, activity by activity */}
      <div style={sec()}>
        <div style={secHead()}>Time &amp; Action plan · {o.planDone}/{o.planTotal} done</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr><th style={th()}>#</th><th style={th()}>Activity</th><th style={th()}>Stage</th><th style={th()}>Planned</th><th style={th()}>Actual</th><th style={th()}>Status</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.seq + t.activity} style={{ background: t.status === 'Done' ? '#fbfefd' : 'transparent' }}>
                <td style={{ ...td(), color: '#9aa0ad' }}>{t.seq}</td>
                <td style={{ ...td(), fontWeight: 600 }}>{t.activity}</td>
                <td style={{ ...td(), color: '#5f6472' }}>{t.stage}</td>
                <td style={td()}>{fmtD(t.plannedEnd)}</td>
                <td style={{ ...td(), color: t.actualEnd ? (t.late ? '#c02b3f' : '#279e97') : '#9aa0ad', fontWeight: 600 }}>{t.actualEnd ? fmtD(t.actualEnd) : '—'}</td>
                <td style={td()}><span style={pill(t.status === 'Done' ? (t.late ? '#e0b50f' : '#279e97') : '#eeece7', t.status === 'Done' ? '#fff' : '#5f6472')}>{t.status === 'Done' ? (t.late ? 'Done late' : 'Done') : t.status}</span></td>
              </tr>))}</tbody>
          </table>
        </div>
        {plan.length > 12 && <button type="button" onClick={() => setAllRows(!allRows)} style={{ ...btn(), background: '#f3f1ec', color: '#111827', margin: 10, width: 'calc(100% - 20px)' }}>{allRows ? 'Show less' : `Show all ${plan.length} activities`}</button>}
      </div>

      {/* colour × size breakup */}
      {(grid || sizes) && <div style={sec()}>
        <div style={secHead()}>Order breakup{o.cutQty ? ` · ${fmtN(o.cutQty)} pcs cut plan` : ''}</div>
        <div style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(grid || []).map((c) => <div key={c.code + c.name} style={{ border: '1px solid #ebe8e3', borderRadius: 10, padding: '6px 10px', fontSize: 12 }}>
            <b>{c.name || c.code}</b> · {fmtN(c.qty)} pcs{c.sizes?.length ? <div style={{ color: '#7a7f8f', fontSize: 11 }}>{c.sizes.map((x) => `${x.size} ${x.qty}`).join(' · ')}</div> : null}</div>)}
          {!grid && (sizes || []).map((x) => <div key={x.size} style={{ border: '1px solid #ebe8e3', borderRadius: 10, padding: '6px 10px', fontSize: 12 }}><b>{x.size}</b> · {fmtN(x.qty)} pcs</div>)}
        </div>
      </div>}

      {/* floor + QC */}
      {!!o.production?.length && <div style={sec()}>
        <div style={secHead()}>On the floor</div>
        <div style={{ padding: 10, display: 'grid', gap: 8 }}>
          {o.production.map((p) => { const pct = p.planned ? Math.min(Math.round(p.done * 100 / p.planned), 100) : 0; return (
            <div key={p.op}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><b>{p.op}</b><span>{fmtN(p.done)} / {fmtN(p.planned)} pcs · {pct}%</span></div>
              <div style={{ height: 7, background: '#eeece7', borderRadius: 999, marginTop: 3, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#1bcfb4' : '#a05aff' }} /></div>
            </div>); })}
        </div>
      </div>}
      {!!o.quality?.length && <div style={sec()}>
        <div style={secHead()}>Quality inspections</div>
        <div style={{ padding: 10, fontSize: 12.5, display: 'grid', gap: 5 }}>
          {o.quality.map((q, i) => <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={pill(q.result === 'Pass' ? '#279e97' : '#c02b3f')}>{q.result}</span><b>{q.stage}</b>
            <span style={{ color: '#7a7f8f' }}>{fmtD(q.date)} · lot {fmtN(q.lotSize)}{q.defects ? ` · ${q.defects} defects found` : ''}</span></div>)}
        </div>
      </div>}

      {/* packing + shipments with documents */}
      {!!o.shipments?.length && <div style={sec()}>
        <div style={secHead()}>Packing &amp; shipment{o.packing ? ` · ${fmtN(o.packing.cartons)} cartons · ${fmtN(o.packing.pcs)} pcs` : ''}</div>
        <div style={{ padding: 10, display: 'grid', gap: 10 }}>
          {o.shipments.map((d) => <div key={d.invoiceNo} style={{ border: '1px solid #ebe8e3', borderRadius: 10, padding: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <b style={{ fontFamily: 'monospace' }}>{d.invoiceNo}</b><span style={pill('#111827')}>{d.status}</span><span style={{ fontSize: 12, color: '#7a7f8f' }}>{d.mode} · {fmtD(d.date)}</span>
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4 }}>{fmtN(d.qty)} pcs · {fmtN(d.cartons)} cartons · gross {d.grossKg || '—'} kg / net {d.netKg || '—'} kg</div>
            <div style={{ fontSize: 12.5, color: '#5f6472' }}>{d.route}{d.vesselOrFlight ? ` · ${d.vesselOrFlight}` : ''}{d.blOrAwbNo ? ` · ${d.mode === 'Air' ? 'AWB' : 'B/L'} ${d.blOrAwbNo}` : ''}{d.eta ? ` · ETA ${fmtD(d.eta)}` : ''}</div>
            {!!d.events.length && <div style={{ fontSize: 12, color: '#7a7f8f', marginTop: 4 }}>{d.events.map((e) => `${e.title} (${fmtD(e.at)})`).join(' → ')}</div>}
            {!!d.documents.length && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{d.documents.map((x) => <span key={x.type} style={pill(x.status === 'Pending' ? '#eeece7' : '#279e97', x.status === 'Pending' ? '#5f6472' : '#fff')}>{x.type}</span>)}</div>}
          </div>)}
        </div>
      </div>}
    </>
  );
}
