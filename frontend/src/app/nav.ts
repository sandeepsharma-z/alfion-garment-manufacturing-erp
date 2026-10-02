import type { IconProps } from '@/icons/icons';
import {
  Dashboard, Samples, Orders, Stock, Planning, Po, Accessory, Vendors, Building,
  Jobwork, Production, Gate, Packing, Dispatch, Payments, Reports, UsersIcon, Settings, Tna, Pattern, Quality, MyWork, Bell, Compliance, Ship,
} from '@/icons/icons';

export type NavItem = {
  key: string; label: string; path: string;
  icon: (p: IconProps) => JSX.Element;
  module?: string;             // permission module if different from key (Buyers lives under "samples")
  phase?: number;              // delivery phase if not live yet (undefined = live now)
  everyone?: boolean;          // no module needed — every signed-in user sees it (My Work, Alert Center)
};
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: 'Merchandising', items: [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: Dashboard },
    { key: 'mywork', everyone: true, label: 'My Work', path: '/my-work', icon: MyWork },
    { key: 'alerts', everyone: true, label: 'Alert Center', path: '/alerts', icon: Bell },
    { key: 'buyers', module: 'samples', label: 'Buyers', path: '/buyers', icon: Building },
    { key: 'samples', label: 'Sample Development', path: '/samples', icon: Samples },
    { key: 'orders', label: 'Orders', path: '/orders', icon: Orders },
    { key: 'buyer-orders', module: 'orders', label: 'Buyer Orders & Shipping', path: '/buyer-orders', icon: Ship },
    { key: 'tna', label: 'TNA — Time & Action', path: '/tna', icon: Tna },
    { key: 'pattern', label: 'Patterns', path: '/patterns', icon: Pattern },
  ]},
  { label: 'Materials', items: [
    { key: 'stock', label: 'Stock & Inventory', path: '/stock', icon: Stock },
    { key: 'planning', label: 'Material Planning', path: '/planning', icon: Planning },
    { key: 'po', label: 'Purchase Orders', path: '/po', icon: Po },
    { key: 'accessory', label: 'Accessories', path: '/accessories', icon: Accessory },
  ]},
  { label: 'Production', items: [
    { key: 'vendors', label: 'Vendors & Suppliers', path: '/vendors', icon: Vendors },
    { key: 'jobwork', label: 'Job Work', path: '/job-work', icon: Jobwork },
    { key: 'production', label: 'Production Floor', path: '/production', icon: Production },
    { key: 'quality', label: 'Quality', path: '/quality', icon: Quality },
  ]},
  { label: 'Receiving', items: [
    { key: 'gate', label: 'Gate Entry', path: '/gate', icon: Gate },
  ]},
  { label: 'Export & Finance', items: [
    { key: 'packing', label: 'Packing & Cartons', path: '/packing', icon: Packing },
    { key: 'dispatch', label: 'Dispatch & Documents', path: '/dispatch', icon: Dispatch },
    { key: 'payments', label: 'Payments (LC / T-T)', path: '/payments', icon: Payments },
  ]},
  { label: 'System', items: [
    { key: 'reports', label: 'Reports & Analytics', path: '/reports', icon: Reports },
    { key: 'compliance', label: 'Compliance', path: '/compliance', icon: Compliance },
    { key: 'users', label: 'Users & Roles', path: '/users', icon: UsersIcon },
    { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
  ]},
];

export const flatNav = NAV.flatMap((g) => g.items);
export const moduleOf = (i: NavItem) => i.module ?? i.key;
