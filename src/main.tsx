import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// StrictMode is intentionally removed: it double-fires useEffect in dev,
// which causes Supabase's Web Locks API to orphan its auth token lock,
// producing "Lock not released within 5000ms" + cascading AbortErrors.
// The app is production-correct without it.
createRoot(document.getElementById('root')!).render(
  <App />
);
