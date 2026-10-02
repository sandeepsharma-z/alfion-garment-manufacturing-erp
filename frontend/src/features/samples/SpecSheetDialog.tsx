import * as React from 'react';
import { toast } from 'sonner';
import { api, apiMessage } from '@/lib/api';
import { useAction, uploadFile, openFile, fmtDate } from '@/lib/crud';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/misc';
import { Print, Upload, Eye, Download, FileIcon } from '@/icons/icons';
import type { Sample } from './SampleDialogs';
import { formatCustom, type FormField } from '@/components/CustomFields';

type SpecData = { sample: Sample; style: { fabric?: string; colour?: string; productType?: string; sizeSet?: string[]; pomUnit?: string; pom?: { code: string; name: string; tolerance: number; spec: Record<string, number> }[];
  techPack?: { composition?: string; lining?: string; article?: string; construction?: string; labelPlacement?: string; packingMethod?: string; accessories?: { item: string; qtyPerPc: number; note: string }[] } } | null; buyerBrand: string };
type Company = { legalName: string; address: string; phone: string; email: string; iec: string; formFields?: { samples?: FormField[] } };

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Printable specification sheet — plain HTML so it prints/saves as PDF from the browser without a PDF library. */
function buildSheet(d: SpecData, c: Company, version: number, images: Record<string, string> = {}) {
  const s = d.sample;
  const pieces = (s.items ?? []).map((i, n) => `<tr><td>${n + 1}</td><td>${i.fileId && images[i.fileId] ? `<img src="${images[i.fileId]}" style="width:72px;height:90px;object-fit:cover;border-radius:6px;border:1px solid #d8dbe2">` : '—'}</td><td>${esc(i.description)}</td><td>${esc(i.fabric)}</td><td>${esc(i.colour)}</td><td>${esc(i.sizes)}</td><td>${i.qty}</td><td>${esc(i.notes)}</td></tr>`).join('');
  const row = (k: string, v: unknown) => `<tr><th>${esc(k)}</th><td>${esc(v) || '—'}</td></tr>`;
  const rounds = s.rounds.map((r) => `<tr><td>${r.no}</td><td>${esc(r.title)}</td><td>${r.sentOn ? fmtDate(r.sentOn) : '—'}</td><td>${esc(r.awb)}</td><td>${esc(r.result)}</td><td>${esc(r.comment)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Specification ${esc(s.styleNo)} v${version}</title>
<style>
body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#1f2430;margin:32px}
h1{font-size:20px;margin:0}h2{font-size:13px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#666}
.head{display:flex;justify-content:space-between;border-bottom:3px solid #f28c4a;padding-bottom:12px}
.head small{color:#666}.stamp{border:2px solid #279e97;color:#279e97;padding:6px 12px;font-weight:700;border-radius:6px;align-self:center}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8dbe2;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f5f6f8;width:200px;font-weight:600}.grid th{width:auto}
.swatch{display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:middle;margin-right:6px;border:1px solid #ccc}
.foot{margin-top:40px;display:flex;justify-content:space-between;color:#666;font-size:11px}
.sign{margin-top:48px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px}
@media print{body{margin:14mm}}
</style></head><body>
<div class="head"><div><h1>${esc(c.legalName || 'Afion International')}</h1><small>${esc(c.address)}${c.phone ? ' · ' + esc(c.phone) : ''}${c.email ? ' · ' + esc(c.email) : ''}${c.iec ? ' · IEC ' + esc(c.iec) : ''}</small>
<div style="margin-top:10px;font-size:16px;font-weight:700">Product Specification Sheet — ${esc(s.styleNo)} <span style="color:#666;font-weight:400">v${version}</span></div></div>
<div class="stamp">SAMPLE APPROVED · ROUND ${s.round}</div></div>
<h2>Style</h2><table>${row('Buyer', d.buyerBrand)}${row('Style Number', s.styleNo)}${row('Product', s.description)}${row('Product Type', d.style?.productType)}
${row('Sample Number', `${s.sampleNo} · ${s.type}`)}${row('Approved On', s.approvedAt ? fmtDate(s.approvedAt) : '')}${row('Merchandiser', s.merchandiser)}</table>
<h2>Fabric &amp; Colour</h2><table>${row('Fabric', s.fabric)}<tr><th>Colour</th><td><span class="swatch" style="background:${esc(s.swatch)}"></span>${esc(s.colour) || '—'}</td></tr>
${row('Colourways', s.colourways)}${row('Size Range', s.sizeRange)}</table>
${pieces ? `<h2>Pieces Sent</h2><table class="grid"><tr><th>#</th><th>Photo</th><th>Piece</th><th>Fabric</th><th>Colour</th><th>Sizes</th><th>Qty</th><th>Notes</th></tr>${pieces}</table>` : ''}
<h2>Accessories &amp; Trims</h2><table>${row('Accessories', s.accessories)}${row('Notes / Buyer Comments', s.notes)}</table>
${d.style?.techPack && Object.values(d.style.techPack).some((v) => (Array.isArray(v) ? v.length : v)) ? `<h2>Tech Pack</h2><table>${row('Composition', d.style.techPack.composition)}${row('Lining', d.style.techPack.lining)}${row('Article', d.style.techPack.article)}${row('Construction', d.style.techPack.construction)}${row('Label placement', d.style.techPack.labelPlacement)}${row('Packing method', d.style.techPack.packingMethod)}</table>${(d.style.techPack.accessories ?? []).length ? `<table class="grid" style="margin-top:6px"><tr><th>Accessory</th><th>Qty / pc</th><th>Note</th></tr>${(d.style.techPack.accessories ?? []).map((a) => `<tr><td>${esc(a.item)}</td><td>${a.qtyPerPc}</td><td>${esc(a.note)}</td></tr>`).join('')}</table>` : ''}` : ''}
${d.style?.pom?.length ? `<h2>Measurement Spec (${esc(d.style.pomUnit || 'cm')})</h2><table class="grid"><tr><th>POM</th><th>Point of measure</th>${(d.style.sizeSet ?? []).map((z) => `<th>${esc(z)}</th>`).join('')}<th>Tol ±</th></tr>${d.style.pom.map((p) => `<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td>${(d.style!.sizeSet ?? []).map((z) => `<td>${p.spec?.[z] ?? '—'}</td>`).join('')}<td>${p.tolerance ?? ''}</td></tr>`).join('')}</table>` : ''}
${(c.formFields?.samples ?? []).filter((fd) => s.custom && s.custom[fd.key!] !== undefined && s.custom[fd.key!] !== '').length ? `<h2>Additional Details</h2><table>${(c.formFields?.samples ?? []).filter((fd) => s.custom && s.custom[fd.key!] !== undefined && s.custom[fd.key!] !== '').map((fd) => row(fd.label, formatCustom(fd, s.custom![fd.key!]))).join('')}</table>` : ''}
${s.courier?.method || s.courier?.awb ? `<h2>Courier</h2><table>${row('Method', s.courier.method)}${row('AWB / Tracking', s.courier.awb)}${row('Receiver', s.courier.receiver)}${row('Notes', s.courier.notes)}</table>` : ''}
<h2>Sampling History</h2><table class="grid"><tr><th>#</th><th>Round</th><th>Sent</th><th>AWB</th><th>Result</th><th>Buyer Comment</th></tr>${rounds}</table>
<div class="sign"><div>Merchandising</div><div>Sampling In-charge</div><div>Production Head</div></div>
<div class="foot"><span>Generated by Afion ERP on ${fmtDate(new Date().toISOString())}</span><span>${esc(s.sampleNo)} · confidential</span></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
}

export default function SpecSheetDialog({ sample, onClose }: { sample: Sample | null; onClose: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const add = useAction<Sample>(['/samples'], (s) => toast.success(`Specification v${s.specSheets.length} attached to ${s.sampleNo}`));
  if (!sample) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const [d, c] = await Promise.all([api.get(`/samples/${sample.id}/spec-data`), api.get('/settings/company')]);
      const images: Record<string, string> = {};
      await Promise.all(((d.data as SpecData).sample.items ?? []).filter((i) => i.fileId).map(async (i) => {
        try { const b = await api.get(`/files/${i.fileId}`, { responseType: 'blob' }); images[i.fileId!] = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(b.data); }); } catch { /* sheet still prints without the photo */ }
      }));
      const html = buildSheet(d.data, c.data, sample.specSheets.length + 1, images);
      const w = window.open('', '_blank');
      if (!w) throw new Error('Pop-up blocked — allow pop-ups for this site to print the sheet');
      w.document.write(html); w.document.close();
      add.mutate({ url: `/samples/${sample.id}/spec`, body: { kind: 'generated' } });
    } catch (e) { toast.error(apiMessage(e)); } finally { setBusy(false); }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) return toast.error('Specification must be PDF, DOC or DOCX');
    setBusy(true);
    try {
      const f = await uploadFile(file, 'sample', sample.id);
      add.mutate({ url: `/samples/${sample.id}/spec`, body: { fileId: f.id, kind: 'uploaded' } });
    } catch (e) { toast.error(apiMessage(e)); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Specification Sheet — {sample.styleNo}</DialogTitle>
          <DialogDescription>Generated from the approved sample, or upload the buyer's own PDF. The latest version travels with the order.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={generate} disabled={busy} className="rounded-xl border p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/40 disabled:opacity-50 dark:hover:bg-accent">
              <Print size={22} className="text-brand" />
              <div className="mt-2 font-semibold">Generate &amp; Print</div>
              <div className="text-[11.5px] text-muted-foreground">Fills style, fabric, colour, trims and sampling history on the company letterhead. Save as PDF from the print dialog.</div>
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-xl border p-4 text-left transition-colors hover:border-brand hover:bg-brand-soft/40 disabled:opacity-50 dark:hover:bg-accent">
              <Upload size={22} className="text-teal" />
              <div className="mt-2 font-semibold">Upload Buyer's Sheet</div>
              <div className="text-[11.5px] text-muted-foreground">PDF, DOC or DOCX up to 25 MB — becomes the next version.</div>
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" hidden onChange={(e) => upload(e.target.files?.[0])} />
          </div>

          <div className="overflow-hidden rounded-xl border">
            <div className="border-b bg-secondary px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Versions</div>
            {!sample.specSheets.length ? <div className="px-4 py-6 text-center text-sm text-muted-foreground">No specification sheet yet.</div>
            : [...sample.specSheets].reverse().map((v) => (
              <div key={v.version} className="flex items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0">
                <FileIcon size={18} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">v{v.version} · {v.fileName}</div>
                  <div className="text-[11px] text-muted-foreground">{v.kind} · {v.by} · {fmtDate(v.at)}</div>
                </div>
                {v.version === sample.specSheets.length && <Badge tone="ok">Current</Badge>}
                {v.fileId ? <>
                  <Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName)}><Eye size={14} /></Button>
                  <Button size="sm" variant="secondary" onClick={() => openFile(v.fileId!, v.fileName, true)}><Download size={14} /></Button>
                </> : <Button size="sm" variant="secondary" onClick={generate}><Print size={14} /> Re-print</Button>}
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
