import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /**
   * Render this instead of the full-screen crash page. Use it to contain a
   * single view so one broken pane doesn't take down the whole app.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** When this changes (e.g. the user switches view), a caught error is cleared. */
  resetKey?: string;
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info);
  }

  reset = () => this.setState({ error: null });

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset();
  }

  render() {
    if (this.state.error && this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset);
    }
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-[#0f0f1a] flex items-center justify-center p-8">
          <div className="bg-[#1a1a2e] border border-red-500/40 rounded-xl p-8 max-w-lg w-full shadow-2xl">
            <h1 className="text-red-400 text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-white/60 text-sm mb-4">
              The app encountered an error. Try refreshing the page.
            </p>
            <pre className="bg-black/40 rounded p-3 text-xs text-red-300 overflow-auto max-h-48">
              {this.state.error.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 rounded-lg transition-colors text-sm"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** In-place fallback for a single view that crashed, used with `fallback`. */
export function PaneError({ name, error, reset }: { name: string; error: Error; reset: () => void }) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="bg-[#1a1a2e] border border-red-500/40 rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-red-400 font-semibold mb-1">{name} hit an error</h2>
        <p className="text-white/60 text-sm mb-3">
          The rest of the app is fine — switch views to keep working, or try this view again.
        </p>
        <pre className="bg-black/40 rounded p-3 text-xs text-red-300 overflow-auto max-h-40">{error.message}</pre>
        <button
          onClick={reset}
          className="mt-3 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
