import ReactDOM from 'react-dom/client';
import { CustomAuthProvider } from './hooks/useCustomAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import './index.css';

// Intercept global unhandled network rejections when maintenance is reported
window.addEventListener('unhandledrejection', (event) => {
    const msg = String(event?.reason?.message || event?.reason || '').toLowerCase();
    if (msg.includes('server under maintenance') || msg.includes('maintenance')) {
        window.dispatchEvent(new CustomEvent('server-maintenance'));
    }
});

const __origConsoleError = console.error;
console.error = (...args) => {
    const first = args[0];
    const str = args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    if (str.includes('net::ERR_ABORTED') || str.includes('AbortError')) {
        return;
    }
    __origConsoleError(...args);
};

const queryClient = new QueryClient({
    logger: {
        log: () => {},
        warn: () => {},
        error: () => {}
    },
    defaultOptions: {
        queries: {
            retry: 0,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false
        }
    }
});

ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
            <CustomAuthProvider>
                <App />
            </CustomAuthProvider>
        </QueryClientProvider>
    </ErrorBoundary>
);
