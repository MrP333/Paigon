import './src/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RunnerScreen from './components/RunnerScreen';

/**
 * Grey-box runner, reachable only at ?runner=1 (optionally &seed=CODE). The
 * branch lives here rather than inside App so App's hooks stay unconditional,
 * and so the live game is genuinely untouched while this is being built.
 */
const params = new URLSearchParams(window.location.search);
const runner = params.get('runner') === '1';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    {runner ? <RunnerScreen roomCode={params.get('seed') || 'GREYBOX'} /> : <App />}
  </React.StrictMode>,
);
