import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Top-level error boundary that prevents the entire app from going
 * to a black screen when a render error occurs.  Offers the user a
 * "Reload" button and, as a last resort, a way to clear local data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReload = () => {
    // Remove the stale last-profile pointer so the app falls back
    // to onboarding on next load rather than loading a bad profile.
    try { localStorage.removeItem('sf-last-profile'); } catch { /* ignore */ }

    // Delete the IndexedDB database so the user gets a fresh start.
    try { indexedDB.deleteDatabase('SpellForgeDB'); } catch { /* ignore */ }

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#FFFBEB',
            color: '#451A03',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: '1.5rem', textAlign: 'center', maxWidth: '24rem' }}>
            SpellForge ran into a problem. Try reloading the app.
          </p>
          {this.state.errorMessage && (
            <p style={{
              marginBottom: '1rem',
              textAlign: 'center',
              maxWidth: '24rem',
              fontSize: '0.75rem',
              color: '#92400E',
              backgroundColor: '#FEF3C7',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              wordBreak: 'break-word',
            }}>
              {this.state.errorMessage}
            </p>
          )}
          <button
            onClick={this.handleReload}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#D97706',
              color: '#fff',
              border: 'none',
              borderRadius: '0.75rem',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '1rem',
            }}
          >
            Reload App
          </button>
          <button
            onClick={this.handleClearAndReload}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              color: '#92400E',
              border: '1px solid #D97706',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Clear data &amp; reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
