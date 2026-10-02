import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Refresh } from '@/icons/icons';

/** A page that throws shows this instead of a blank screen; navigating to another page resets it (keyed by location in AppShell). */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('page crashed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div className="max-w-lg rounded-xl border bg-card p-6 shadow-card">
          <h2 className="font-slab text-xl font-bold">This page hit an error</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing was saved incorrectly. Reload the page; if it keeps happening, send this message to support.</p>
          <pre className="mt-3 overflow-auto rounded-lg bg-secondary p-3 text-left text-[11px] text-bad">{String(this.state.error?.message || this.state.error)}</pre>
          <Button className="mt-4" onClick={() => window.location.reload()}><Refresh size={15} /> Reload page</Button>
        </div>
      </div>
    );
  }
}
