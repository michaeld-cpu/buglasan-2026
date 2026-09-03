import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

/* Self-hosted, same family as the public site. Only the weight axis is pulled
   in, the panel uses 400/600/700 and nothing else. */
import '@fontsource-variable/archivo/wght.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>);
