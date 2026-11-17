import express from 'express';
import { ApiDependencies, createAuthMiddleware } from './auth.js';

type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

export function createNotificationsRouter(
  { db }: ApiDependencies,
  { verifyTokenAndRole }: AuthMiddleware
) {
  const router = express.Router();

  router.post(
    '/notifications/notify-admins',
    verifyTokenAndRole,
    async (req: any, res: any) => {
      try {
        const { entityId, entityType, commentContent, authorName, tag, link } =
          req.body;

        const authorId = req.user.uid;
        const authorRole = req.user.role;

        // Only notify when the author is a viewer or manager.
        if (authorRole !== 'viewer' && authorRole !== 'manager') {
          return res
            .status(200)
            .json({ message: 'No notification needed for this role' });
        }

        const targetUsersSnapshot = await db
          .collection('users')
          .where('role', 'in', ['super_admin', 'manager'])
          .get();

        const batch = db.batch();
        let count = 0;

        targetUsersSnapshot.forEach((doc) => {
          const targetUserId = doc.id;
          if (targetUserId !== authorId) {
            const notificationRef = db.collection('notifications').doc();
            batch.set(notificationRef, {
              userId: targetUserId,
              title: `Nova observação (${tag})`,
              message: `${authorName} comentou em ${entityType}: ${String(
                commentContent || ''
              ).substring(0, 100)}${
                String(commentContent || '').length > 100 ? '...' : ''
              }`,
              type: tag === '#Erro' ? 'error' : 'info',
              read: false,
              createdAt: new Date().toISOString(),
              link: link || '/dashboard',
            });
            count++;
          }
        });

        if (count > 0) {
          await batch.commit();
        }

        return res
          .status(200)
          .json({ message: `Notifications sent to ${count} users` });
      } catch (error: any) {
        console.error('Error sending notifications:', error);
        return res
          .status(500)
          .json({ error: error?.message || 'Internal server error' });
      }
    }
  );

  return router;
}
