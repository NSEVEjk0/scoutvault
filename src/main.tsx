import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/geist/latin-700.css';
import { MotionConfig } from 'motion/react';
import { App } from './App';
import './styles.css';

globalThis.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
