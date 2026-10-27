import React, { Component } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends Component {
  state = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[360px] w-full flex flex-col items-center justify-center p-8 text-center bg-card dark:bg-[#0D2028] text-foreground rounded-2xl border border-border dark:border-[#203A42] m-4 shadow-sm animate-in fade-in-50">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>
          <h3 className="font-bold text-lg mb-1 text-foreground dark:text-[#E8F0F4]">Something went wrong in this section</h3>
          <p className="text-xs text-muted-foreground dark:text-[#A8BAC3] mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred while rendering this component.'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="cursor-pointer rounded-xl border-[#D5E5D7] dark:border-[#203A42]"
            >
              Try Again
            </Button>
            <Button
              size="sm"
              onClick={() => {
                window.location.reload();
              }}
              className="cursor-pointer rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

