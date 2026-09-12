import React from 'react';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('DocBit encountered an unexpected error:', error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-paper-50 px-6">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto mb-5 h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 text-xl">
              !
            </div>
            <h1 className="font-display text-2xl text-ink-900 mb-2">Something went wrong</h1>
            <p className="text-ink-600/70 text-sm mb-6">
              DocBit ran into an unexpected problem while rendering your data. Your original file has not been
              modified. Try going back and re-checking your configuration.
            </p>
            <button
              onClick={this.handleReset}
              className="focus-ring inline-flex items-center justify-center rounded-lg bg-ink-900 text-paper-50 px-5 py-2.5 text-sm font-medium hover:bg-ink-800 transition-colors"
            >
              Start over
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
