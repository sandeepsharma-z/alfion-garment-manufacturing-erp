import * as React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiMessage } from '@/lib/api';
import { useItem, openFile, fmtDate, fmtN, toInputDate } from '@/lib/crud';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton, Table, THead, TBody, Tr, Th, Td, Badge } from '@/components/ui/misc';
import { PageHeader, KpiTile, StatusPill, AuthImg, Field } from '@/components/shared';
import { formatCustom, type FormField } from '@/components/CustomFields';
import { ArrowLeft, Edit, Login, Check, Refresh, Eye, Download, Orders as OrdersIcon, Samples as SamplesIcon, Clock, Print, Payments } from '@/icons/icons';
import { RoundDialog, ConvertDialog, type Sample } from './SampleDialogs';
import SpecSheetDialog from './SpecSheetDialog';
import { PomDialog, MeasureDialog, ApprovalsDialog, TechPackDialog, useStyle, openPrint, companyHead, type Approval, type Style } from './StyleTools';
import { CostingPanel, computeTotals, costingHtml, withDefaults, hasCosting } from './CostingSheet';
import { MaterialPanel, avgOf } from './MaterialSheet';

const TONE: Record<string, 'ok' | 'bad' | 'warn' | 'info' | 'mute'> = { Approved: 'ok', Rejected: 'bad', Resubmit: 'warn', Submitted: 'info', Received: 'info', Pending: 'mute' };
const Row = ({ k, v }: { k: string; v?: React.ReactNode }) => <div className="flex items-start justify-between gap-3 py-1 text-[13px]"><span className="shrink-0 text-muted-foreground">{k}</span><span className="text-right font-semibold">{v || '—'}</span></div>;
const TABS = ['Overview', 'Pieces', 'POM spec', 'Measurements', 'Materials', 'Costing', 'Approvals', 'Tech pack', 'Tracking'] as const;
type Tab = typeof TABS[number];
const KEY: Record<string, Tab> = { overview: 'Overview', pieces: 'Pieces', pom: 'POM spec', measure: 'Measurements', materials: 'Materials', costing: 'Costing', approvals: 'Approvals', techpack: 'Tech pack', tracking: 'Tracking' };
const SLUG: Record<Tab, string> = { Overview: 'overview', Pieces: 'pieces', 'POM spec': 'pom', Measurements: 'measure', Materials: 'materials', Costing: 'costing', Approvals: 'approvals', 'Tech pack': 'techpack', Tracking: 'tracking' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Everything about one sample on one page — no popups: request, pieces & photos, POM, measurements, costing, approvals, tech pack and the buyer's dates. */
export default function SampleDetailPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const { data: s, isLoading } = useItem<Sample>(`/samples/${id}`);
  const style = useStyle(s?.styleId);
  const approvals = useQuery<{ items: Approval[]; saved: boolean }>({ queryKey: ['/styles', s?.styleId, 'approvals'], queryFn: async () => (await api.get(`/styles/${s!.styleId}/approvals`)).data, enabled: !!s?.styleId });
  const company = useItem<{ formFields?: { samples?: FormField[] } }>('/settings/company');
  const [round, setRound] = React.useState<{ s: Sample; mode: 'sent' | 'feedback' } | null>(null);
  const [spec, setSpec] = React.useState(false);
  const [convert, setConvert] = React.useState(false);
  const tab: Tab = KEY[sp.get('tab') || ''] ?? 'Overview';
  const setTab = (t: Tab) => { const next = new URLSearchParams(sp); if (t === 'Overview') next.delete('tab'); else next.set('tab', SLUG[t]); setSp(next, { replace: true }); };
  if (isLoading || !s) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-40" /><Skeleton className="h-64" /></div>;
  const st = style.data;
  const sizes = st?.sizeSet ?? [];
  const measuredRounds = s.rounds.filter((r) => r.measurements?.length);
  const custom = (company.data?.formFields?.samples ?? []).filter((f) => s.custom && s.custom[f.key!] !== undefined && s.custom[f.key!] !== '');
  const apAll = approvals.data?.items ?? [];
  const ap = apAll.filter((x) => x.status !== 'Pending' || x.dueDate || x.receivedOn || x.submittedOn || x.awb || x.comment);
  const canEdit = ['In Sampling', 'Revision'].includes(s.status);
  const cost = hasCosting(s.costing) ? computeTotals(withDefaults(s.costing)) : null;
  const photos = (s.items ?? []).flatMap((p) => (p.photos?.length ? p.photos : p.fileId ? [{ fileId: p.fileId, fileName: p.fileName }] : []));

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader title={`${s.sampleNo} · ${s.styleNo}`} sub={`${s.buyerName} · ${s.description} · ${s.type} · round ${s.round}`}>
        <Button variant="secondary" asChild><Link to="/samples"><ArrowLeft size={16} /> All Samples</Link></Button>
        <Button variant="secondary" onClick={() => dossier(s, st, ap)}><Print size={15} /> Sample sheet</Button>
        {canEdit && <Button variant="secondary" asChild><Link to={`/samples/${s.id}/edit`}><Edit size={15} /> Edit</Link></Button>}
        {canEdit && <Button onClick={() => setRound({ s, mode: 'sent' })}><Login size={15} /> Mark Sent to Buyer</Button>}
        {['Sent', 'Client Review'].includes(s.status) && <Button onClick={() => setRound({ s, mode: 'feedback' })}><Check size={15} /> Log Buyer Feedback</Button>}
        {s.status === 'Rejected' && <Button variant="secondary" onClick={() => setRound({ s, mode: 'feedback' })}><Refresh size={15} /> Reopen</Button>}
        {s.status === 'Approved' && !s.orderId && <Button className="from-gold-vivid to-gold text-[#241d03]" onClick={() => setConvert(true)}><OrdersIcon size={15} /> Convert to Order</Button>}
        {s.orderId && <Button variant="secondary" asChild><Link to={`/orders/${s.orderId}`}><OrdersIcon size={15} /> {s.orderNo}</Link></Button>}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={SamplesIcon} label="Status" value={s.status} tone={s.status === 'Approved' ? 'teal' : s.status === 'Rejected' ? 'bad' : 'brand'} foot={`round ${s.round} of ${s.rounds.length} · ${s.merchandiser}`} />
        <KpiTile icon={Clock} label="Target send date" value={fmtDate(s.targetDate)} tone="gold" foot={s.priority !== 'Normal' ? `${s.priority} priority` : 'normal priority'} />
        <KpiTile icon={Check} label="Approvals" value={`${ap.filter((a) => a.status === 'Approved').length} / ${ap.length}`} tone="info" foot={`${ap.filter((a) => !['Pending', 'Approved'].includes(a.status)).length} in progress`} />
        {cost ? <KpiTile icon={Payments} label="Sample cost / pc" value={`₹${fmtN(cost.final)}`} tone="brand" foot={`${cost.finalFx} ${s.costing?.currency}${s.costing?.targetPrice ? ` · target ${s.costing.targetPrice}` : ''}`} />
          : <KpiTile icon={OrdersIcon} label="Order" value={s.orderNo || '—'} tone={s.orderId ? 'teal' : 'mute'} foot={s.orderId ? 'converted' : s.status === 'Approved' ? 'ready to convert' : 'after approval'} />}
      </div>

      {/* tabs */}
      <div className="flex flex-wrap rounded-lg border bg-secondary p-0.5 text-xs font-semibold">
        {TABS.map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5', tab === t ? 'bg-card shadow-card' : 'text-muted-foreground')}>{t}
          {t === 'POM spec' && st?.pom?.length ? <span className="ml-1 text-[10px] text-muted-foreground">{st.pom.length}</span> : null}
          {t === 'Costing' && cost ? <span className="ml-1 text-[10px] text-teal">✓</span> : null}
          {t === 'Pieces' && photos.length ? <span className="ml-1 text-[10px] text-muted-foreground">{photos.length}</span> : null}
          {t === 'Materials' && s.materials?.length ? <span className="ml-1 text-[10px] text-muted-foreground">{s.materials.length}</span> : null}
        </button>)}
      </div>

      {/* ---------------- overview ---------------- */}
      {tab === 'Overview' && <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Pieces</CardTitle><Button size="sm" variant="secondary" onClick={() => setTab('Pieces')}>All photos</Button></CardHeader>
            <CardContent className="space-y-2">
              {!s.items?.length ? <div className="flex items-center gap-3"><div className="h-20 w-16 rounded-lg" style={{ background: `linear-gradient(150deg, ${s.swatch}, ${s.swatch}99)` }} /><div className="text-[13px]"><div className="font-semibold">{s.fabric || '—'}</div><div className="text-muted-foreground">{s.colour || '—'} · {s.sizeRange}</div></div></div>
              : s.items.map((p, i) => {
                const shots = p.photos?.length ? p.photos : p.fileId ? [{ fileId: p.fileId, fileName: p.fileName }] : [];
                return (
                  <div key={i} className="flex gap-3 rounded-lg border p-2">
                    {shots[0] ? <button type="button" onClick={() => openFile(shots[0].fileId!, shots[0].fileName || `piece-${i + 1}`)} className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border bg-secondary"><AuthImg fileId={shots[0].fileId} alt={p.description} className="h-full w-full object-cover" />{shots.length > 1 && <span className="absolute bottom-0 right-0 rounded-tl bg-ink/80 px-1 text-[9px] font-bold text-white">+{shots.length - 1}</span>}</button> : <div className="h-20 w-16 shrink-0 rounded-lg" style={{ background: `linear-gradient(150deg, ${s.swatch}, ${s.swatch}99)` }} />}
                    <div className="min-w-0 text-[12.5px]"><div className="font-semibold">{p.description || `Piece ${i + 1}`}</div><div className="text-muted-foreground">{p.fabric || '—'} · {p.colour || '—'}</div><div className="text-muted-foreground">Sizes {p.sizes || '—'} · {p.qty} pc{p.qty > 1 ? 's' : ''}</div>{p.notes && <div className="text-[11.5px] text-muted-foreground">{p.notes}</div>}</div>
                  </div>); })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="divide-y">
              <Row k="Buyer" v={s.buyerName} /><Row k="Style" v={s.styleNo} /><Row k="Sample type" v={s.type} /><Row k="Fabric" v={s.fabric} /><Row k="Colour" v={<span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-3.5 rounded-full border" style={{ background: s.swatch }} />{s.colour || '—'}</span>} />
              <Row k="Size range" v={s.sizeRange} /><Row k="Pieces · colourways" v={`${s.pieces} · ${s.colourways}`} /><Row k="Accessories" v={s.accessories} /><Row k="Notes" v={s.notes} /><Row k="Merchandiser" v={s.merchandiser} />
              {s.tracking?.articleNo && <Row k="Buyer article" v={s.tracking.articleNo} />}
              {custom.map((f) => <Row key={f.key} k={f.label} v={formatCustom(f, s.custom![f.key!])} />)}
            </CardContent>
          </Card>
          {(s.courier?.method || s.courier?.awb) && <Card><CardHeader><CardTitle>Courier</CardTitle></CardHeader><CardContent className="divide-y"><Row k="Method" v={s.courier.method} /><Row k="AWB" v={s.courier.awb} /><Row k="Receiver" v={s.courier.receiver} /><Row k="Notes" v={s.courier.notes} /></CardContent></Card>}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Specification sheets</CardTitle><Button size="sm" variant="secondary" onClick={() => setSpec(true)}><Print size={13} /> {s.specSheets.length ? 'New version' : 'Generate / upload'}</Button></CardHeader>
            <CardContent className="space-y-1.5">
              {!s.specSheets.length ? <div className="text-[12.5px] text-gold">Not attached yet — generate it once the buyer approves, or upload the buyer's tech pack from Edit.</div>
              : s.specSheets.map((v) => <div key={v.version} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]"><Badge tone={v.version === s.specSheets.length ? 'ok' : 'mute'}>v{v.version}</Badge><span className="min-w-0 flex-1 truncate">{v.fileName}</span><span className="text-[11px] text-muted-foreground">{v.kind} · {fmtDate(v.at)}</span>{v.fileId && <><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName)}><Eye size={12} /></Button><Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName, true)}><Download size={12} /></Button></>}</div>)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader><div><CardTitle>Rounds</CardTitle><p className="text-xs text-muted-foreground">Sent → buyer feedback → approved / changes → next round</p></div></CardHeader>
            <CardContent>
              <div className="relative pl-6 before:absolute before:bottom-1 before:left-2 before:top-1 before:w-0.5 before:bg-border">
                {s.rounds.map((r) => (
                  <div key={r.no} className="relative pb-4 last:pb-0">
                    <span className={cn('absolute -left-[22px] top-1 h-[11px] w-[11px] rounded-full border-2 bg-card', r.result === 'approved' ? 'border-teal bg-teal' : r.result === 'changes' || r.result === 'rejected' ? 'border-gold-vivid bg-gold-vivid' : r.result === 'sent' ? 'border-brand bg-brand ring-4 ring-brand/15' : 'border-border')} />
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">{r.title} <StatusPill value={r.result} /></div>
                    <div className="text-[12px] text-muted-foreground">{r.sentOn ? `Sent ${fmtDate(r.sentOn)}` : 'Not sent yet'}{r.courier ? ` · ${r.courier}` : ''}{r.awb ? ` · AWB ${r.awb}` : ''}{r.dueDate ? ` · due ${fmtDate(r.dueDate)}` : ''}{r.pcsPerColour ? ` · ${r.pcsPerColour} pcs/colour` : ''}{r.commentsOn ? ` · comments ${fmtDate(r.commentsOn)}` : ''}</div>
                    {r.comment && <div className="mt-1 rounded-lg border bg-secondary/60 px-2.5 py-1.5 text-[12.5px]"><b>Buyer:</b> {r.comment}</div>}
                    {r.measurements?.length ? <div className="mt-1 text-[11.5px] text-muted-foreground">Measured size {r.size} · {r.measurements.filter((m) => m.measured != null).length} POM · {r.measurements.filter((m) => m.instruction).length} instruction{r.measurements.filter((m) => m.instruction).length === 1 ? '' : 's'}</div> : null}
                  </div>))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Costing</CardTitle><p className="text-xs text-muted-foreground">Cost of one piece — the quote basis</p></div><Button size="sm" variant="secondary" onClick={() => setTab('Costing')}><Edit size={13} /> {cost ? 'Edit' : 'Fill'}</Button></CardHeader>
              <CardContent className="divide-y">
                {!cost ? <div className="text-[13px] text-muted-foreground">Not filled yet — fabric, trims, processes, wastage and profit of one piece.</div> : <>
                  <Row k="Material" v={`₹${fmtN(cost.material)}`} /><Row k="Process" v={`₹${fmtN(cost.process)}`} /><Row k={`Wastage ${s.costing?.wastagePct ?? 0}%`} v={`₹${fmtN(cost.wastage)}`} /><Row k="Charges" v={`₹${fmtN(cost.charges)}`} /><Row k={`Profit ${s.costing?.profitPct ?? 0}%`} v={`₹${fmtN(cost.profit)}`} />
                  <Row k="Final / pc" v={<span className="text-brand">₹{fmtN(cost.final)} · {cost.finalFx} {s.costing?.currency}</span>} />
                </>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Material requirement</CardTitle><p className="text-xs text-muted-foreground">What one piece eats — the BOM is built from it</p></div><Button size="sm" variant="secondary" onClick={() => setTab('Materials')}><Edit size={13} /> {s.materials?.length ? 'Open' : 'Fill'}</Button></CardHeader>
              <CardContent className="p-0">
                {!s.materials?.length ? <div className="p-5 text-[13px] text-muted-foreground">Not filled yet — fabric, thread, trims, buttons, labels and packing per piece.</div>
                : <div className="divide-y">{s.materials.slice(0, 6).map((l, i) => <div key={i} className="flex items-center justify-between gap-2 px-4 py-1.5 text-[12.5px]"><div className="min-w-0"><span className="font-semibold">{l.item || '\u2014'}</span><span className="text-[11px] text-muted-foreground"> \u00b7 {l.group}{l.description ? ` \u00b7 ${l.description}` : ''}</span></div><span className="num shrink-0 text-[12px]">{avgOf(l)} {l.unit}/pc</span></div>)}
                  {s.materials.length > 6 && <div className="px-4 py-1.5 text-[11.5px] text-muted-foreground">+{s.materials.length - 6} more</div>}
                  {s.materialPlan?.qty ? <div className="px-4 py-1.5 text-[11.5px] text-muted-foreground">Worked out on {s.materialPlan.qty} pcs</div> : null}</div>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Approvals</CardTitle><p className="text-xs text-muted-foreground">Lab dip, strike-offs, trim card, sample kinds</p></div><Button size="sm" variant="secondary" onClick={() => setTab('Approvals')}><Edit size={13} /> Update</Button></CardHeader>
              <CardContent className="p-0">
                {!ap.length ? <div className="p-5 text-[13px] text-muted-foreground">Nothing recorded yet{apAll.length ? ` — ${apAll.length} kinds available on the Approvals tab` : ''}.</div>
                : <div className="divide-y">{ap.map((a, i) => <div key={i} className="flex items-center justify-between gap-2 px-4 py-2 text-[12.5px]"><div className="min-w-0"><div className="font-semibold">{a.title}</div><div className="truncate text-[11px] text-muted-foreground">{a.submittedOn ? `sent ${fmtDate(a.submittedOn)}` : a.receivedOn ? `received ${fmtDate(a.receivedOn)}` : a.dueDate ? `due ${fmtDate(a.dueDate)}` : a.group}{a.awb ? ` · ${a.awb}` : ''}{a.approvedOn && a.status === 'Approved' ? ` · approved ${fmtDate(a.approvedOn)}` : ''}{a.comment ? ` · ${a.comment}` : ''}</div></div><Badge tone={TONE[a.status] ?? 'mute'}>{a.status}</Badge></div>)}</div>}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>}

      {/* ---------------- pieces gallery ---------------- */}
      {tab === 'Pieces' && <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><div><CardTitle>Pieces &amp; photos</CardTitle><p className="text-xs text-muted-foreground">Every view you attached — click a photo to open it full size</p></div>{canEdit && <Button size="sm" variant="secondary" asChild><Link to={`/samples/${s.id}/edit`}><Edit size={13} /> Edit pieces</Link></Button>}</CardHeader>
        <CardContent className="space-y-4">
          {!s.items?.length ? <div className="text-[13px] text-muted-foreground">No pieces recorded.</div>
          : s.items.map((p, i) => {
            const shots = p.photos?.length ? p.photos : p.fileId ? [{ fileId: p.fileId, fileName: p.fileName }] : [];
            return (
              <div key={i} className="rounded-xl border p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft font-slab text-[11px] font-bold text-brand dark:bg-accent">{i + 1}</span>
                  <span className="text-[13.5px] font-semibold">{p.description || `Piece ${i + 1}`}</span>
                  <span className="text-[12px] text-muted-foreground">{p.fabric || '—'} · {p.colour || '—'} · sizes {p.sizes || '—'} · {p.qty} pc{p.qty > 1 ? 's' : ''}</span></div>
                {p.notes && <div className="mb-2 text-[12px] text-muted-foreground">{p.notes}</div>}
                <div className="flex flex-wrap gap-2">
                  {shots.map((sh, j) => <button key={j} type="button" onClick={() => openFile(sh.fileId!, sh.fileName || `piece-${i + 1}-${j + 1}`)} className="h-[150px] w-[115px] overflow-hidden rounded-lg border bg-secondary transition-transform hover:-translate-y-0.5"><AuthImg fileId={sh.fileId} alt="" className="h-full w-full object-cover" /></button>)}
                  {!shots.length && <div className="grid h-[150px] w-[115px] place-items-center rounded-lg border border-dashed text-[11px] text-muted-foreground">no photo</div>}
                </div>
              </div>); })}
        </CardContent>
      </Card>}

      {/* ---------------- inline panels ---------------- */}
      {tab === 'POM spec' && (s.styleId ? <PomDialog inline styleId={s.styleId} onClose={() => setTab('Overview')} /> : <Card><CardContent className="p-5 text-[13px] text-muted-foreground">No style linked to this sample.</CardContent></Card>)}

      {tab === 'Measurements' && <div className="space-y-5">
        <MeasureDialog inline sample={s} onClose={() => setTab('Overview')} />
        {st?.pom?.length ? <Card>
          <CardHeader><div><CardTitle>Spec vs every round</CardTitle><p className="text-xs text-muted-foreground">Red = outside tolerance · → = revised spec after the buyer's comments</p></div></CardHeader>
          <CardContent className="p-0"><div className="overflow-x-auto"><Table>
            <THead><Tr className="hover:bg-transparent"><Th>POM</Th><Th>Point of measure</Th>{sizes.map((z) => <Th key={z} className="text-center">{z}</Th>)}<Th className="text-center">Tol ±</Th>{measuredRounds.map((r) => <Th key={r.no} className="text-center">R{r.no} ({r.size})</Th>)}{measuredRounds.map((r) => <Th key={`i${r.no}`}>R{r.no} instruction</Th>)}</Tr></THead>
            <TBody>{st.pom.map((p) => <Tr key={p.code}><Td className="font-mono text-xs font-bold">{p.code}</Td><Td className="text-xs">{p.name}</Td>{sizes.map((z) => <Td key={z} className="num text-center text-xs">{p.spec?.[z] ?? '—'}</Td>)}<Td className="num text-center text-xs text-muted-foreground">{p.tolerance}</Td>
              {measuredRounds.map((r) => { const m = r.measurements?.find((x) => x.code === p.code); const spec = p.spec?.[r.size || '']; const d = m?.measured != null && spec != null ? Math.round((m.measured - spec) * 100) / 100 : null; return <Td key={r.no} className={cn('num text-center text-xs font-semibold', d != null && Math.abs(d) > (p.tolerance ?? 0.5) ? 'text-bad' : d != null ? 'text-teal' : 'text-muted-foreground')}>{m?.measured ?? '—'}{d != null ? <span className="text-[10px] font-normal"> ({d > 0 ? '+' : ''}{d})</span> : ''}{m?.revised != null ? <div className="text-[10px] font-normal text-brand">→ {m.revised}</div> : null}</Td>; })}
              {measuredRounds.map((r) => <Td key={`i${r.no}`} className="text-xs">{r.measurements?.find((x) => x.code === p.code)?.instruction || ''}</Td>)}
            </Tr>)}</TBody>
          </Table></div></CardContent>
        </Card> : null}
      </div>}

      {tab === 'Materials' && <MaterialPanel inline sample={s} onClose={() => setTab('Overview')} />}
      {tab === 'Costing' && <CostingPanel inline sample={s} onClose={() => setTab('Overview')} />}
      {tab === 'Approvals' && (s.styleId ? <ApprovalsDialog inline styleId={s.styleId} styleNo={s.styleNo} onClose={() => setTab('Overview')} /> : null)}
      {tab === 'Tech pack' && (s.styleId ? <TechPackDialog inline styleId={s.styleId} onClose={() => setTab('Overview')} /> : null)}
      {tab === 'Tracking' && <TrackingPanel sample={s} />}

      <RoundDialog target={round} onClose={() => setRound(null)} />
      <SpecSheetDialog sample={spec ? s : null} onClose={() => setSpec(false)} />
      <ConvertDialog sample={convert ? s : null} onClose={() => setConvert(false)} />
    </div>
  );
}

/* ---------- buyer sample-status sheet: what came in, and every round's dates ---------- */
function TrackingPanel({ sample }: { sample: Sample }) {
  const qc = useQueryClient();
  const [t, setT] = React.useState({ articleNo: '', factory: '', processes: '', colourQtyOn: '', bomOn: '', techPackOn: '', artworkOn: '', ccMaterial: '', remarks: '' });
  React.useEffect(() => { const x = sample.tracking ?? {}; setT({ articleNo: x.articleNo ?? '', factory: x.factory ?? '', processes: x.processes ?? '', ccMaterial: x.ccMaterial ?? '', remarks: x.remarks ?? '', colourQtyOn: toInputDate(x.colourQtyOn), bomOn: toInputDate(x.bomOn), techPackOn: toInputDate(x.techPackOn), artworkOn: toInputDate(x.artworkOn) }); }, [sample]);
  const save = useMutation({ mutationFn: async () => (await api.put(`/samples/${sample.id}/tracking`, t)).data, onSuccess: () => { toast.success('Tracking saved'); qc.invalidateQueries({ queryKey: ['/samples'] }); }, onError: (e) => toast.error(apiMessage(e)) });
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0"><div><CardTitle>What the buyer sent</CardTitle><p className="text-xs text-muted-foreground">The columns of the buyer's sample status sheet that belong to the whole style — printed on the sample sheet.</p></div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}><Check size={14} /> Save</Button></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Buyer article no"><Input value={t.articleNo} onChange={(e) => setT({ ...t, articleNo: e.target.value })} /></Field>
          <Field label="Factory / unit"><Input value={t.factory} onChange={(e) => setT({ ...t, factory: e.target.value })} /></Field>
          <Field label="Processes"><Input value={t.processes} onChange={(e) => setT({ ...t, processes: e.target.value })} placeholder="Print · Embroidery · Wash" /></Field>
          <Field label="CC material"><Input value={t.ccMaterial} onChange={(e) => setT({ ...t, ccMaterial: e.target.value })} placeholder="received / awaited" /></Field>
          <Field label="Colour & qty detail received"><Input type="date" value={t.colourQtyOn} onChange={(e) => setT({ ...t, colourQtyOn: e.target.value })} /></Field>
          <Field label="BOM received"><Input type="date" value={t.bomOn} onChange={(e) => setT({ ...t, bomOn: e.target.value })} /></Field>
          <Field label="Tech pack received"><Input type="date" value={t.techPackOn} onChange={(e) => setT({ ...t, techPackOn: e.target.value })} /></Field>
          <Field label="Artwork received"><Input type="date" value={t.artworkOn} onChange={(e) => setT({ ...t, artworkOn: e.target.value })} /></Field>
          <Field label="Remarks" className="sm:col-span-3 lg:col-span-4"><Input value={t.remarks} onChange={(e) => setT({ ...t, remarks: e.target.value })} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Round by round</CardTitle><p className="text-xs text-muted-foreground">Plan vs actual send-out, AWB and comment dates — fill them on the Measurements tab or when you mark a round sent.</p></div></CardHeader>
        <CardContent className="p-0"><Table>
          <THead><Tr className="hover:bg-transparent"><Th>Round</Th><Th>Type</Th><Th>Due</Th><Th className="text-right">Pcs / colour</Th><Th>Sent</Th><Th>Actual sent</Th><Th>AWB</Th><Th>Comments on</Th><Th>Result</Th></Tr></THead>
          <TBody>{sample.rounds.map((r) => <Tr key={r.no}><Td className="font-semibold">R{r.no}</Td><Td className="text-xs">{r.type}</Td><Td className="text-xs">{r.dueDate ? fmtDate(r.dueDate) : '—'}</Td><Td className="num text-right">{r.pcsPerColour ?? '—'}</Td><Td className="text-xs">{r.sentOn ? fmtDate(r.sentOn) : '—'}</Td><Td className="text-xs">{r.actualSentOn ? fmtDate(r.actualSentOn) : '—'}</Td><Td className="font-mono text-xs">{r.awb || '—'}</Td><Td className="text-xs">{r.commentsOn ? fmtDate(r.commentsOn) : '—'}</Td><Td><StatusPill value={r.result} /></Td></Tr>)}</TBody>
        </Table></CardContent>
      </Card>
    </div>
  );
}

/* ---------- printable sample dossier: request, tracking, pieces (with photos), POM, rounds, costing, approvals, tech pack ---------- */
const asDataUrl = async (fileId: string) => {
  try {
    const r = await api.get(`/files/${fileId}`, { responseType: 'blob' });
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(r.data); });
  } catch { return ''; }
};
async function dossier(s: Sample, st: Style | undefined, ap: Approval[]) {
  const head = await companyHead(`Sample Sheet — ${s.sampleNo} · ${s.styleNo}`);
  const items = s.items ?? [];
  const shotsOf = (p: typeof items[number]) => (p.photos?.length ? p.photos : p.fileId ? [{ fileId: p.fileId, fileName: p.fileName }] : []);
  const urls = await Promise.all(items.flatMap((p) => shotsOf(p).slice(0, 3).map(async (sh) => [sh.fileId!, await asDataUrl(sh.fileId!)] as const)));
  const byId = Object.fromEntries(urls);
  const sizes = st?.sizeSet ?? [];
  const cost = hasCosting(s.costing) ? withDefaults(s.costing) : null;
  const tr = s.tracking ?? {};
  const block = (title: string, body: string) => `<h2>${title}</h2>${body}`;
  openPrint(`Sample ${s.sampleNo}`, head + `
  ${block('Request', `<table>
    <tr><th>Buyer</th><td>${esc(s.buyerName)}</td><th>Style</th><td>${esc(s.styleNo)}</td><th>Sample</th><td>${esc(s.sampleNo)} · ${esc(s.type)}</td></tr>
    <tr><th>Description</th><td colspan="3">${esc(s.description)}</td><th>Status</th><td>${esc(s.status)} · round ${s.round}</td></tr>
    <tr><th>Size range</th><td>${esc(s.sizeRange)}</td><th>Pieces</th><td>${s.pieces} · ${s.colourways} colourway(s)</td><th>Target send</th><td>${s.targetDate ? fmtDate(s.targetDate) : '—'}</td></tr>
    <tr><th>Fabric</th><td>${esc(s.fabric)}</td><th>Colour</th><td>${esc(s.colour)}</td><th>Merchandiser</th><td>${esc(s.merchandiser)}</td></tr>
    <tr><th>Accessories</th><td colspan="5">${esc(s.accessories)}</td></tr>
    <tr><th>Notes</th><td colspan="5">${esc(s.notes)}</td></tr></table>`)}
  ${block('Buyer inputs &amp; dates', `<table>
    <tr><th>Article no</th><td>${esc(tr.articleNo)}</td><th>Factory</th><td>${esc(tr.factory)}</td><th>Processes</th><td>${esc(tr.processes)}</td></tr>
    <tr><th>Colour &amp; qty</th><td>${tr.colourQtyOn ? fmtDate(tr.colourQtyOn) : '—'}</td><th>BOM</th><td>${tr.bomOn ? fmtDate(tr.bomOn) : '—'}</td><th>Tech pack</th><td>${tr.techPackOn ? fmtDate(tr.techPackOn) : '—'}</td></tr>
    <tr><th>Artwork</th><td>${tr.artworkOn ? fmtDate(tr.artworkOn) : '—'}</td><th>CC material</th><td>${esc(tr.ccMaterial)}</td><th>Remarks</th><td>${esc(tr.remarks)}</td></tr></table>`)}
  ${block('Pieces', items.map((p, i) => `<table style="margin-bottom:10px"><tr>
      <td style="width:230px">${shotsOf(p).slice(0, 3).map((sh) => byId[sh.fileId!] ? `<img src="${byId[sh.fileId!]}" style="width:70px;height:92px;object-fit:cover;border:1px solid #d8dbe2;margin-right:4px">` : '').join('')}</td>
      <td><b>${i + 1}. ${esc(p.description)}</b><br><small>${esc(p.fabric)} · ${esc(p.colour)} · sizes ${esc(p.sizes)} · ${p.qty} pc(s)</small>${p.notes ? `<br><small>${esc(p.notes)}</small>` : ''}</td></tr></table>`).join('') || '<p><small>No pieces recorded.</small></p>')}
  ${st?.pom?.length ? block(`Measurement spec (POM) — ${esc(st.pomUnit || 'cm')}`, `<table><tr><th>POM</th><th>Point of measure</th>${sizes.map((z) => `<th class="num">${esc(z)}</th>`).join('')}<th class="num">Tol ±</th></tr>${st.pom.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td>${sizes.map((z) => `<td class="num">${p.spec?.[z] ?? '—'}</td>`).join('')}<td class="num">${p.tolerance ?? ''}</td></tr>`).join('')}</table>`) : ''}
  ${block('Rounds', `<table><tr><th>Round</th><th>Type</th><th>Due</th><th class="num">Pcs/colour</th><th>Sent</th><th>Actual</th><th>AWB</th><th>Comments on</th><th>Result</th><th>Buyer comment</th></tr>${s.rounds.map((r) => `<tr><td>R${r.no}</td><td>${esc(r.type)}</td><td>${r.dueDate ? fmtDate(r.dueDate) : ''}</td><td class="num">${r.pcsPerColour ?? ''}</td><td>${r.sentOn ? fmtDate(r.sentOn) : ''}</td><td>${r.actualSentOn ? fmtDate(r.actualSentOn) : ''}</td><td>${esc(r.awb)}</td><td>${r.commentsOn ? fmtDate(r.commentsOn) : ''}</td><td>${esc(r.result)}</td><td>${esc(r.comment)}</td></tr>`).join('')}</table>`)}
  ${ap.length ? block('Approvals', `<table><tr><th>Item</th><th>Group</th><th>Received</th><th>Sent to buyer</th><th>AWB</th><th>Approved</th><th>Status</th><th>Comment</th></tr>${ap.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(a.group)}</td><td>${a.receivedOn ? fmtDate(a.receivedOn) : ''}</td><td>${a.submittedOn ? fmtDate(a.submittedOn) : ''}</td><td>${esc(a.awb)}</td><td>${a.approvedOn ? fmtDate(a.approvedOn) : ''}</td><td>${esc(a.status)}</td><td>${esc(a.comment)}</td></tr>`).join('')}</table>`) : ''}
  ${st?.techPack && Object.values(st.techPack).some((v) => (Array.isArray(v) ? v.length : v)) ? block('Tech pack', `<table>
    <tr><th>Composition</th><td>${esc(st.techPack.composition)}</td><th>Lining</th><td>${esc(st.techPack.lining)}</td></tr>
    <tr><th>Article</th><td>${esc(st.techPack.article)}</td><th>Label placement</th><td>${esc(st.techPack.labelPlacement)}</td></tr>
    <tr><th>Construction</th><td colspan="3">${esc(st.techPack.construction)}</td></tr>
    <tr><th>Packing</th><td colspan="3">${esc(st.techPack.packingMethod)}</td></tr>
    ${(st.techPack.accessories ?? []).map((a) => `<tr><th>${esc(a.item)}</th><td class="num">× ${a.qtyPerPc}</td><td colspan="2">${esc(a.note)}</td></tr>`).join('')}</table>`) : ''}
  ${(s.materials ?? []).length ? block(`Material requirement${s.materialPlan?.qty ? ` — on ${fmtN(s.materialPlan.qty)} pcs` : ''}`, `<table><tr><th>S.No</th><th>Category</th><th>Item</th><th>Description</th><th>Unit</th><th class="num">Cons / pc</th><th class="num">Waste %</th><th class="num">Avg cons</th><th class="num">Required</th><th>Supplier</th><th>Required date</th><th>Remarks</th></tr>${(s.materials ?? []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.group)}</td><td>${esc(l.item)}</td><td>${esc(l.description)}</td><td>${esc(l.unit)}</td><td class="num">${l.perPc}</td><td class="num">${l.wastePct}</td><td class="num">${avgOf(l)}</td><td class="num">${s.materialPlan?.qty ? fmtN(Math.ceil(avgOf(l) * s.materialPlan.qty)) : ''}</td><td>${esc(l.supplierName)}</td><td>${l.requiredDate ? fmtDate(l.requiredDate) : ''}</td><td>${esc(l.remarks)}</td></tr>`).join('')}</table>`) : ''}
  ${cost ? block('Costing', costingHtml(cost, s)) : ''}
  <div class="sign"><div>Sampling</div><div>Merchandiser</div><div>Buyer</div></div>`);
}
