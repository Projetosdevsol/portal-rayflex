import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createApiApp } from './api.js';

initializeApp();

const db = getFirestore();
const auth = getAuth();
const app = createApiApp({ db, auth });

/**
 * HTTPS function that serves the platform's `/api/**` routes.
 * `firebase.json` rewrites `/api/**` to this function, so the SPA never
 * receives `index.html` in place of a JSON API response.
 */
export const api = onRequest(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 10,
    invoker: 'public',
  },
  (req, res) => app(req, res)
);
