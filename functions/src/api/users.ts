import express from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ApiDependencies,
  ROLE_HIERARCHY,
  createAuthMiddleware,
} from './auth.js';
import { HttpError, sendFirebaseError } from './errors.js';

type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;

function assertCanAssignRole(currentRole: string, targetRole: string) {
  if (ROLE_HIERARCHY[currentRole] === undefined) {
    throw new HttpError(403, 'Perfil de usuário inválido.', 'invalid-role');
  }

  if (
    targetRole &&
    (ROLE_HIERARCHY[targetRole] === undefined ||
      ROLE_HIERARCHY[targetRole] > ROLE_HIERARCHY[currentRole])
  ) {
    throw new HttpError(
      403,
      'Você não pode atribuir um nível de acesso maior que o seu.',
      'role-hierarchy'
    );
  }
}

export function createUsersRouter(
  { db, auth }: ApiDependencies,
  { verifyTokenAndRole }: AuthMiddleware
) {
  const router = express.Router();

  router.get('/users', verifyTokenAndRole, async (req: any, res: any) => {
    try {
      const authUsersResult = await auth.listUsers();
      const authUsers = authUsersResult.users;

      const firestoreUsersSnapshot = await db.collection('users').get();
      const firestoreUsers: Record<string, any> = {};
      firestoreUsersSnapshot.forEach((doc) => {
        firestoreUsers[doc.id] = doc.data();
      });

      const mergedUsers = authUsers.map((authUser) => {
        const firestoreData = firestoreUsers[authUser.uid] || {};
        return {
          uid: authUser.uid,
          email: authUser.email,
          displayName:
            authUser.displayName || firestoreData.displayName || 'Sem nome',
          role: firestoreData.role || 'viewer',
          sector: firestoreData.sector || '',
          permissions: firestoreData.permissions || [],
          createdAt: authUser.metadata.creationTime,
          lastSignInTime: authUser.metadata.lastSignInTime,
          disabled: authUser.disabled,
          existsInFirestore: !!firestoreUsers[authUser.uid],
          loginHistory: firestoreData.loginHistory || [],
        };
      });

      return res.status(200).json(mergedUsers);
    } catch (error: any) {
      return sendFirebaseError(res, error, 'listing users');
    }
  });

  router.put('/users/:uid', verifyTokenAndRole, async (req: any, res: any) => {
    try {
      const { uid } = req.params;
      const { name, email, password, sector, role, permissions } = req.body;
      const currentUserRole = req.user.role;

      const targetUserDoc = await db.collection('users').doc(uid).get();
      const targetUserRole = targetUserDoc.exists
        ? targetUserDoc.data()?.role || 'viewer'
        : 'viewer';

      if (ROLE_HIERARCHY[targetUserRole] > ROLE_HIERARCHY[currentUserRole]) {
        return res.status(403).json({
          error: 'Você não pode editar um usuário com nível maior que o seu.',
        });
      }

      if (role) {
        assertCanAssignRole(currentUserRole, role);
      }

      const updateAuthData: any = {};
      if (name) updateAuthData.displayName = name;
      if (email) updateAuthData.email = email;
      if (password) {
        if (password.length < 6) {
          return res
            .status(400)
            .json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }
        // Firebase Auth hashes the password internally (scrypt).
        // We never store the password or a hash in Firestore.
        updateAuthData.password = password;
      }

      if (Object.keys(updateAuthData).length > 0) {
        await auth.updateUser(uid, updateAuthData);
      }

      const updateFirestoreData: any = {};
      if (name) updateFirestoreData.displayName = name;
      if (email) updateFirestoreData.email = email;
      if (sector !== undefined) updateFirestoreData.sector = sector;
      if (role) updateFirestoreData.role = role;
      if (permissions !== undefined) {
        updateFirestoreData.permissions = permissions;
      }

      if (Object.keys(updateFirestoreData).length > 0) {
        if (targetUserDoc.exists) {
          await db.collection('users').doc(uid).update(updateFirestoreData);
        } else {
          const authUser = await auth.getUser(uid);
          await db.collection('users').doc(uid).set({
            uid,
            displayName: name || authUser.displayName || 'Sem nome',
            email: email || authUser.email,
            role: role || 'viewer',
            sector: sector || '',
            createdAt: FieldValue.serverTimestamp(),
            ...updateFirestoreData,
          });
        }
      }

      await db.collection('auditLogs').add({
        timestamp: FieldValue.serverTimestamp(),
        userId: req.user.uid,
        userEmail: req.user.email,
        action: targetUserDoc.exists ? 'update' : 'create_sync',
        entityType: 'users',
        entityId: uid,
        before: targetUserDoc.exists ? targetUserDoc.data() : null,
        after: { ...targetUserDoc.data(), ...updateFirestoreData },
        description: `${
          targetUserDoc.exists ? 'Updated' : 'Synchronized'
        } user ${email || targetUserDoc.data()?.email || uid}`,
        details: `${
          targetUserDoc.exists ? 'Usuário atualizado' : 'Usuário sincronizado'
        }: ${email || targetUserDoc.data()?.email || uid}`,
      });

      return res.status(200).json({ message: 'User updated successfully' });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      return sendFirebaseError(res, error, 'updating user');
    }
  });

  router.delete(
    '/users/:uid',
    verifyTokenAndRole,
    async (req: any, res: any) => {
      try {
        const { uid } = req.params;
        const currentUserRole = req.user.role;

        const targetUserDoc = await db.collection('users').doc(uid).get();
        if (!targetUserDoc.exists) {
          return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const targetUserRole = targetUserDoc.data()?.role || 'viewer';
        if (ROLE_HIERARCHY[targetUserRole] > ROLE_HIERARCHY[currentUserRole]) {
          return res.status(403).json({
            error: 'Você não pode excluir um usuário com nível maior que o seu.',
          });
        }

        await auth.deleteUser(uid);
        await db.collection('users').doc(uid).delete();

        await db.collection('auditLogs').add({
          timestamp: FieldValue.serverTimestamp(),
          userId: req.user.uid,
          userEmail: req.user.email,
          action: 'delete',
          entityType: 'users',
          entityId: uid,
          before: targetUserDoc.data(),
          description: `Deleted user ${targetUserDoc.data()?.email}`,
          details: `Usuário excluído: ${targetUserDoc.data()?.email || uid}`,
          severity: 'high',
        });

        return res.status(200).json({ message: 'User deleted successfully' });
      } catch (error: any) {
        return sendFirebaseError(res, error, 'deleting user');
      }
    }
  );

  router.post('/users', verifyTokenAndRole, async (req: any, res: any) => {
    try {
      const { name, email, password, sector, role, permissions } = req.body;

      if (!name || !email || !password || !role) {
        return res
          .status(400)
          .json({ error: 'Preencha todos os campos obrigatórios.' });
      }

      assertCanAssignRole(req.user.role, role);

      const existingUserDoc = await db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (!existingUserDoc.empty) {
        return res
          .status(400)
          .json({ error: 'Este e-mail já está cadastrado no sistema.' });
      }

      // Firebase Auth hashes the password internally (scrypt).
      // We never store the password or a hash in Firestore.
      const userRecord = await auth.createUser({
        email,
        password,
        displayName: name,
      });

      const userData = {
        uid: userRecord.uid,
        displayName: name,
        email,
        role,
        sector,
        permissions: permissions || [],
        createdAt: FieldValue.serverTimestamp(),
      };

      await db.collection('users').doc(userRecord.uid).set(userData);

      await db.collection('auditLogs').add({
        timestamp: FieldValue.serverTimestamp(),
        userId: req.user.uid,
        userEmail: req.user.email,
        action: 'create',
        entityType: 'users',
        entityId: userRecord.uid,
        after: userData,
        description: `Created new user ${email} with role ${role}`,
        details: `Usuário criado: ${email} (${role})`,
      });

      return res
        .status(201)
        .json({ message: 'User created successfully', uid: userRecord.uid });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      return sendFirebaseError(res, error, 'creating user');
    }
  });

  return router;
}
