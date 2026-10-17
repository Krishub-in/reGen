import React, { Component } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends Component {
  state = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          id="server-maintenance-screen"
          style={{
            minHeight: '100vh',
            width: '100vw',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#111111',
            color: '#ffffff',
            textAlign: 'center',
            padding: '2rem',
            boxSizing: 'border-box',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          <h1
            style={{
              color: '#ffffff',
              fontSize: '2.5rem',
              fontWeight: '800',
              letterSpacing: '-0.025em',
              margin: '0 0 1rem 0'
            }}
          >
            Server Under Maintenance
          </h1>
          <p
            style={{
              color: '#ffffff',
              fontSize: '1.125rem',
              maxWidth: '520px',
              lineHeight: 1.6,
              margin: 0,
              opacity: 0.9
            }}
          >
            Our services are currently undergoing maintenance. Please check back shortly.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
