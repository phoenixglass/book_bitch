import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('React error boundary caught:', error, info);
  }

  render() {
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
