// ============================================================
// ZHINO — Error Boundary
// A single broken component must never white-screen the whole app.
// ============================================================

import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Real errors are logged, never silently swallowed.
    console.error('[ZHINO] Unhandled render error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5] p-6">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl shadow-amber-100">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl font-black text-amber-700">
            ژ
          </div>
          <h1 className="mb-2 text-xl font-extrabold text-slate-800">مشکلی پیش آمد</h1>
          <p className="mb-6 text-sm leading-7 text-slate-500">
            متأسفیم! بخشی از صفحه به‌درستی بارگذاری نشد. لطفاً دوباره تلاش کنید.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex-1 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-600"
            >
              تلاش مجدد
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 rounded-2xl bg-stone-100 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-stone-200"
            >
              بارگذاری دوباره
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre
              dir="ltr"
              className="mt-4 max-h-32 overflow-auto rounded-xl bg-slate-900 p-3 text-left text-[11px] leading-5 text-red-300"
            >
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
