import express from 'express';
import { ApiDependencies, createAuthMiddleware } from './auth.js';
import {
  CleanupRequester,
  CleanupService,
  parseClearableCollections,
} from './cleanupJobs.js';
import { HttpError } from './errors.js';

type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

function sendCleanupError(res: any, error: any) {
  if (error instanceof HttpError) {
    return res
      .status(error.status)
      .json({ error: error.message, code: error.code });
  }

  console.error('Error clearing data:', error);
  return res.status(500).json({
    error: 'Não foi possível concluir a limpeza de dados. Tente novamente.',
    code: 'cleanup-failed',
  });
}

export function createClearDataRouter(
  { db }: ApiDependencies,
  { verifyTokenAndRole, requireSuperAdmin, requireRecentAuth }: AuthMiddleware
) {
  const router = express.Router();
  const service = new CleanupService(db);

  const requesterFrom = (req: any): CleanupRequester => ({
    uid: req.user.uid,
    email: req.user.email || null,
  });

  /**
   * Starts (or resumes) a cleanup job. Requires a recent password
   * reauthentication, proven by `auth_time` in the freshly-issued ID token.
   */
  router.post(
    '/admin/clear-data',
    verifyTokenAndRole,
    requireSuperAdmin,
    requireRecentAuth,
    async (req: any, res: any) => {
      try {
        const collections = parseClearableCollections(req.body?.collections);
        const status = await service.startJob(
          collections,
          requesterFrom(req)
        );

        return res.status(200).json({
          ...status,
          message: status.resumed
            ? 'Uma limpeza anterior foi retomada.'
            : 'Limpeza de dados iniciada.',
        });
      } catch (error: any) {
        return sendCleanupError(res, error);
      }
    }
  );

  /** Read-only progress endpoint used by the UI while the job runs. */
  router.get(
    '/admin/clear-data/:jobId',
    verifyTokenAndRole,
    requireSuperAdmin,
    async (req: any, res: any) => {
      try {
        const status = await service.getStatus(
          req.params.jobId,
          requesterFrom(req)
        );
        return res.status(200).json(status);
      } catch (error: any) {
        return sendCleanupError(res, error);
      }
    }
  );

  /**
   * Processes the next time slice of the job. The client calls this endpoint
   * until `status` is `completed` or `failed`, which keeps large collections
   * within Cloud Function and proxy timeouts.
   */
  router.post(
    '/admin/clear-data/:jobId/continue',
    verifyTokenAndRole,
    requireSuperAdmin,
    async (req: any, res: any) => {
      try {
        const { busy, status } = await service.continueJob(
          req.params.jobId,
          requesterFrom(req)
        );

        if (busy) {
          return res.status(202).json({
            ...status,
            message: 'A limpeza já está sendo processada. Aguarde.',
          });
        }

        return res.status(200).json(status);
      } catch (error: any) {
        return sendCleanupError(res, error);
      }
    }
  );

  return router;
}
