import * as React from 'react';

/* Per-form metadata shared between a dialog and the shared <Field> component: admin overrides for built-in fields
   (label, placeholder, help text, required, hidden) and a tiny store that tracks which required fields are empty. */
export type Override = { label?: string; placeholder?: string; hint?: string; required?: boolean; hidden?: boolean; type?: 'text' | 'textarea' | 'select' | 'email' | 'phone' | 'url'; options?: string[] };
export const TEXT_DISPLAY: [NonNullable<Override['type']>, string][] = [['text', 'Short text'], ['textarea', 'Long text'], ['select', 'Dropdown'], ['email', 'E-mail'], ['phone', 'Phone'], ['url', 'Web link']];
export type FormMeta = {
  form: string;
  lookup: (label: string) => Override | undefined;
  report: (key: string, missing: boolean) => void;
};
export const keyOf = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
export const FormMetaCtx = React.createContext<FormMeta | null>(null);
export const useFormMeta = () => React.useContext(FormMetaCtx);
