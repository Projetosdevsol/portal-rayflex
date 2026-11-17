import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';
import { createApiApp } from './functions/src/api';

// Initialize Firebase Admin.
// In production, set FIREBASE_SERVICE_ACCOUNT_KEY (or run with default
// credentials). The projectId must match the client tokens.
let adminApp;
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined;

  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let projectId = 'portal-rayflex';
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.projectId) projectId = config.projectId;
  }

  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  } else {
    adminApp = initializeApp({ projectId });
  }
} catch (error) {
  console.warn(
    'Firebase Admin initialization failed. Ensure FIREBASE_SERVICE_ACCOUNT_KEY is set in secrets.',
    error
  );
}

const db = adminApp ? getFirestore(adminApp) : null;
const auth = adminApp ? getAuth(adminApp) : null;

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// The API is mounted before Vite/static so `/api/**` is never answered with
// the SPA's index.html in local development or in the production container.
if (db && auth) {
  // The Cloud Function has its own firebase-admin install; the runtime API is
  // identical, so the cast only avoids duplicate-package nominal typing.
  app.use(createApiApp({ db: db as any, auth: auth as any }));
} else {
  app.use('/api', (_req, res) => {
    res.status(500).json({
      error:
        'Firebase Admin não inicializado. Configure FIREBASE_SERVICE_ACCOUNT_KEY.',
    });
  });
}

// Vite middleware for development.
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
