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
      <div className="flex min-h-screen items-center justify-center bg-blush-page p-6">
        <div className="panel-lux w-full max-w-md rounded-2xl p-8 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-wine-900 text-2xl font-extrabold text-gold-300 ring-1 ring-wine-900/15">
            ژ
          </div>
          <h1 className="mb-2 text-xl font-bold text-wine-950">مشکلی پیش آمد</h1>
          <p className="mb-7 text-sm leading-8 text-mocha">
            متأسفیم! بخشی از صفحه به‌درستی بارگذاری نشد. لطفاً دوباره تلاش کنید.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={this.handleReset}
              className="btn-lux btn-wine flex-1 rounded-xl px-4"
            >
              تلاش مجدد
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-lux btn-line-dark flex-1 rounded-xl px-4"
            >
              بارگذاری دوباره
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <pre
              dir="ltr"
              className="mt-4 max-h-32 overflow-auto rounded-xl bg-noir p-3 text-left text-[11px] leading-5 text-wine-500"
            >
              {this.state.error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
