import { useLocation } from 'react-router-dom';
import { flatNav } from '@/app/nav';
import { Badge } from '@/components/ui/misc';
import { Clock } from '@/icons/icons';

export default function ComingSoon() {
  const loc = useLocation();
  const item = flatNav.find((i) => i.path === loc.pathname);
  return (
    <div className="grid min-h-[60vh] place-items-center animate-rise">
      <div className="max-w-md text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-soft text-brand dark:bg-accent">
          {item ? <item.icon size={30} /> : <Clock size={30} />}
        </div>
        <h1 className="mt-5 font-slab text-2xl font-bold">{item?.label ?? 'This module'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This module ships in <b className="text-foreground">Phase {item?.phase ?? '2'}</b> of the
          delivery plan. The screen design is already approved in the demo — it will appear here
          with live data when its phase lands.
        </p>
        <Badge tone="brand" className="mt-4">Phase {item?.phase ?? 2} · as per SRS delivery plan</Badge>
      </div>
    </div>
  );
}
