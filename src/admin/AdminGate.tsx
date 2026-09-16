// ============================================================
// ZHINO — admin route guard
// While a persisted Supabase session is being verified the gate shows
// a short status line; with no session it sends the visitor to the
// login page (replace, so «back» doesn't loop).
// ============================================================

import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from './auth/AuthContext';
import AdminLayout from './AdminLayout';

function SessionCheck() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-page px-4">
      <div className="panel-lux w-full max-w-sm rounded-2xl px-6 py-7 text-center">
        <p className="text-sm font-bold text-wine-950">در حال بررسی نشست مدیر…</p>
        <p className="mt-2 text-[0.72rem] leading-6 text-mocha">
          اگر این پیام ماند، اتصال به دیتابیس را بررسی کنید.
        </p>
      </div>
    </div>
  );
}

export default function AdminGate() {
  const { session, status } = useAdminAuth();

  if (status === 'loading') {
    return <SessionCheck />;
  }

  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
}
