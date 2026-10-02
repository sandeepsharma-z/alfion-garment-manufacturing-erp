import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

/* The client's "Possible Materials / Accessories" list — one source for every material box in the software. */
export type CatalogGroup = { group: string; category: 'Fabric' | 'Accessory' | 'Packing'; itemType: string; unit: string; items: string[] };

export const useMaterialCatalog = () => useQuery<{ catalog: CatalogGroup[]; items: string[] }>({
  queryKey: ['/settings/material-catalog'], queryFn: async () => (await api.get('/settings/material-catalog')).data, staleTime: 6e5 });

/** The group a typed name belongs to (case-insensitive), so category / UOM can follow the name. */
export const groupOfItem = (catalog: CatalogGroup[] | undefined, name: string) =>
  (catalog ?? []).find((g) => g.items.some((i) => i.toLowerCase() === (name || '').trim().toLowerCase()));

/** Type-or-pick material name. Native datalist — keeps free text allowed, no extra widget. */
export function MaterialNameInput({ value, onChange, group, placeholder, className, id }:
  { value: string; onChange: (v: string, g?: CatalogGroup) => void; group?: string; placeholder?: string; className?: string; id?: string }) {
  const { data } = useMaterialCatalog();
  const listId = React.useId().replace(/:/g, '') + (id || 'mat');
  const groups = data?.catalog ?? [];
  const items = group ? (groups.find((g) => g.group === group)?.items ?? []) : (data?.items ?? []);
  return (
    <>
      <Input list={listId} value={value} className={className} placeholder={placeholder || 'Type or pick — e.g. Main Fabric, Zippers, Poly Bag…'}
        onChange={(e) => onChange(e.target.value, groupOfItem(groups, e.target.value))} />
      <datalist id={listId}>{items.map((i) => <option key={i} value={i} />)}</datalist>
    </>
  );
}
