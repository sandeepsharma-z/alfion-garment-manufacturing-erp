import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import AppShell from '@/app/layout/AppShell';
import LoginPage from '@/features/auth/LoginPage';
import ChangePasswordPage from '@/features/auth/ChangePasswordPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import UsersPage from '@/features/users/UsersPage';
import BuyersPage from '@/features/buyers/BuyersPage';
import VendorsPage from '@/features/vendors/VendorsPage';
import StockPage from '@/features/stock/StockPage';
import SamplesPage from '@/features/samples/SamplesPage';
import SampleDetailPage from '@/features/samples/SampleDetailPage';
import SampleFormPage from '@/features/samples/SampleFormPage';
import OrdersPage from '@/features/orders/OrdersPage';
import OrderDetailPage from '@/features/orders/OrderDetailPage';
import BuyerOrdersPage from '@/features/orders/BuyerOrdersPage';
import PlanningPage from '@/features/planning/PlanningPage';
import SettingsPage from '@/features/settings/SettingsPage';
import PoPage from '@/features/po/PoPage';
import GatePage from '@/features/gate/GatePage';
import AccessoriesPage from '@/features/accessory/AccessoriesPage';
import JobWorkPage from '@/features/jobwork/JobWorkPage';
import ProductionPage from '@/features/production/ProductionPage';
import PackingPage from '@/features/packing/PackingPage';
import TnaPage, { TemplatePage } from '@/features/tna/TnaPage';
import OrderLivePage from '@/features/tna/OrderPipeline';
import PatternPage from '@/features/pattern/PatternPage';
import QualityPage from '@/features/quality/QualityPage';
import AlertsPage from '@/features/alerts/AlertsPage';
import MyWorkPage from '@/features/mywork/MyWorkPage';
import DispatchPage from '@/features/dispatch/DispatchPage';
import PaymentsPage from '@/features/payments/PaymentsPage';
import CompliancePage from '@/features/compliance/CompliancePage';
import ReportsPage from '@/features/reports/ReportsPage';
import PortalPage from '@/features/portal/PortalPage';
import ComingSoon from '@/features/shared/ComingSoon';
import { flatNav, moduleOf } from '@/app/nav';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="animate-pulse font-slab text-lg font-bold text-muted-foreground">Afion ERP…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

/* land users without dashboard access on their first accessible module */
function Home() {
  const { hasModule } = useAuth();
  if (hasModule('dashboard')) return <DashboardPage />;
  const first = flatNav.find((i) => !i.everyone && hasModule(moduleOf(i)));
  return <Navigate to={first?.path ?? '/change-password'} replace />;
}

function Gate({ moduleKey, children }: { moduleKey: string; children: React.ReactNode }) {
  const { hasModule } = useAuth();
  if (!hasModule(moduleKey)) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-center">
        <div>
          <h2 className="font-slab text-xl font-bold">No access</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your account does not include this module. Ask your admin.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/track/:token" element={<PortalPage />} />   {/* public buyer portal — no session */}
            <Route element={<Protected />}>
              <Route path="/" element={<Home />} />
              <Route path="/buyers" element={<Gate moduleKey="samples"><BuyersPage /></Gate>} />
              <Route path="/samples" element={<Gate moduleKey="samples"><SamplesPage /></Gate>} />
              <Route path="/samples/new" element={<Gate moduleKey="samples"><SampleFormPage /></Gate>} />
              <Route path="/samples/:id/edit" element={<Gate moduleKey="samples"><SampleFormPage /></Gate>} />
              <Route path="/samples/:id" element={<Gate moduleKey="samples"><SampleDetailPage /></Gate>} />
              <Route path="/orders" element={<Gate moduleKey="orders"><OrdersPage /></Gate>} />
              <Route path="/orders/:id" element={<Gate moduleKey="orders"><OrderDetailPage /></Gate>} />
              <Route path="/buyer-orders" element={<Gate moduleKey="orders"><BuyerOrdersPage /></Gate>} />
              <Route path="/stock" element={<Gate moduleKey="stock"><StockPage /></Gate>} />
              <Route path="/planning" element={<Gate moduleKey="planning"><PlanningPage /></Gate>} />
              <Route path="/vendors" element={<Gate moduleKey="vendors"><VendorsPage /></Gate>} />
              <Route path="/po" element={<Gate moduleKey="po"><PoPage /></Gate>} />
              <Route path="/accessories" element={<Gate moduleKey="accessory"><AccessoriesPage /></Gate>} />
              <Route path="/gate" element={<Gate moduleKey="gate"><GatePage /></Gate>} />
              <Route path="/job-work" element={<Gate moduleKey="jobwork"><JobWorkPage /></Gate>} />
              <Route path="/production" element={<Gate moduleKey="production"><ProductionPage /></Gate>} />
              <Route path="/packing" element={<Gate moduleKey="packing"><PackingPage /></Gate>} />
              <Route path="/tna" element={<Gate moduleKey="tna"><TnaPage /></Gate>} />
              <Route path="/tna/order/:id" element={<Gate moduleKey="tna"><OrderLivePage /></Gate>} />
              <Route path="/tna/templates/:id" element={<Gate moduleKey="tna"><TemplatePage /></Gate>} />
              <Route path="/patterns" element={<Gate moduleKey="pattern"><PatternPage /></Gate>} />
              <Route path="/quality" element={<Gate moduleKey="quality"><QualityPage /></Gate>} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/my-work" element={<MyWorkPage />} />
              <Route path="/dispatch" element={<Gate moduleKey="dispatch"><DispatchPage /></Gate>} />
              <Route path="/payments" element={<Gate moduleKey="payments"><PaymentsPage /></Gate>} />
              <Route path="/compliance" element={<Gate moduleKey="compliance"><CompliancePage /></Gate>} />
              <Route path="/reports" element={<Gate moduleKey="reports"><ReportsPage /></Gate>} />
              <Route path="/users" element={<Gate moduleKey="users"><UsersPage /></Gate>} />
              <Route path="/settings" element={<Gate moduleKey="settings"><SettingsPage /></Gate>} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              {flatNav.filter((i) => i.phase).map((i) => (
                <Route key={i.key} path={i.path} element={<Gate moduleKey={moduleOf(i)}><ComingSoon /></Gate>} />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontFamily: 'Outfit, sans-serif' } }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
