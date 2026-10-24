import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Shown instead of the children after a render error. */
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  onError?(error: unknown, info: ErrorInfo): void;
  /** Changing this clears the error (e.g. the open panel's id). */
  resetKey?: unknown;
  children: ReactNode;
}

interface State {
  error: unknown;
  resetKey: unknown;
}

/** Keeps a bug in one part of the UI from unmounting the whole editor (and the host page). */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;
    const { fallback } = this.props;
    if (typeof fallback === 'function') return fallback(this.reset);
    return fallback ?? null;
  }
}
