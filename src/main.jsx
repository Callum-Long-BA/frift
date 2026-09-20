import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary
      fallback={(error) => (
        <main className="crash">
          <h1 className="wordmark">
            <em>FRIFT</em>
          </h1>
          <p>Something went wrong drawing the page.</p>
          <pre>{String(error?.message ?? error)}</pre>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </main>
      )}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
