import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

/**
 * The runner used to mount here, ahead of App, behind ?runner=1 — which meant
 * it bypassed auth, balance and matchmaking entirely. It is the game now, so
 * it goes through the normal flow and that branch is gone.
 */
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
