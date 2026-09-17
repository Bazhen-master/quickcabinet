import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startAutosave, useAppStore } from './app/store';
import { loadSavedProjectProgress } from './infra/save-load';

document.body.style.margin = '0';
document.body.style.padding = '0';
document.body.style.fontFamily = "'Manrope', 'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif";
document.body.style.lineHeight = '1.35';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// Restore the autosaved project before the first render, then start autosaving (never over it with an empty project).
loadSavedProjectProgress()
  .then((saved) => {
    if (saved) useAppStore.getState().hydrateSavedProject(saved);
  })
  .finally(() => {
    startAutosave();
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
