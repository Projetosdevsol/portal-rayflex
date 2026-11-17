import express from 'express';
import cors from 'cors';
import { ApiDependencies, createAuthMiddleware } from './api/auth.js';
import { createUsersRouter } from './api/users.js';
import { createNotificationsRouter } from './api/notifications.js';
import { createClearDataRouter } from './api/clearData.js';

export { CLEARABLE_COLLECTIONS } from './api/cleanupJobs.js';
export type { ClearableCollection } from './api/cleanupJobs.js';

/**
 * Single implementation of the platform API.
 *
 * It is used by `server.ts` during local development and by the `api` Cloud
 * Function in production. Firebase Hosting rewrites `/api/**` to the function,
 * so destructive operations never run in the browser and the SPA never
 * receives `index.html` where JSON is expected.
 */
export function createApiApp(deps: ApiDependencies) {
  const app = express();
  const authMiddleware = createAuthMiddleware(deps);

  app.disable('x-powered-by');
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true, service: 'rayflex-api' });
  });

  app.use('/api', createUsersRouter(deps, authMiddleware));
  app.use('/api', createNotificationsRouter(deps, authMiddleware));
  app.use('/api', createClearDataRouter(deps, authMiddleware));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado.' });
  });

  // Always answer JSON, including malformed request bodies and unexpected
  // errors. This prevents the frontend from trying to parse an HTML page.
  app.use(
    (
      error: any,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (res.headersSent) return next(error);

      if (error?.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Corpo da requisição inválido.' });
      }

      console.error('Unhandled API error:', error);
      return res.status(error?.status || 500).json({
        error: error?.message || 'Erro interno do servidor.',
      });
    }
  );

  return app;
}
