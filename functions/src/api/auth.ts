import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

export interface ApiDependencies {
  db: Firestore;
  auth: Auth;
}

export interface AuthenticatedUser extends DecodedIdToken {
  role: string;
}

/** Same hierarchy used by the frontend and by the Express server. */
export const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  manager: 60,
  editor: 40,
  user: 40,
  viewer: 20,
};

/**
 * Super-admin identities already recognised by the platform
 * (AuthContext + firestore.rules). Keep this list in sync with those files.
 */
const SUPER_ADMIN_UIDS = new Set(['ocH5vnmyMbWElrB2G0xmnlmXzgs1']);
const SUPER_ADMIN_EMAILS = new Set([
  'suporte@rayflex.com.br',
  'suporte@solution-sp.com.br',
]);
const SUPER_ADMIN_VERIFIED_EMAILS = new Set(['projetossolutiondev@gmail.com']);

const MAX_AUTH_AGE_SECONDS = 10 * 60;

/**
 * Resolves the effective role. The Firestore `users/{uid}.role` document is the
 * platform source of truth; custom claims and the established super-admin
 * identities are also honoured so a legitimate super_admin cannot be blocked
 * by a missing/stale profile document.
 */
export async function resolveRole(
  decoded: DecodedIdToken,
  db: Firestore
): Promise<string> {
  const email =
    typeof decoded.email === 'string' ? decoded.email.toLowerCase() : '';

  if (SUPER_ADMIN_UIDS.has(decoded.uid)) return 'super_admin';
  if (email && SUPER_ADMIN_EMAILS.has(email)) return 'super_admin';
  if (
    email &&
    SUPER_ADMIN_VERIFIED_EMAILS.has(email) &&
    decoded.email_verified === true
  ) {
    return 'super_admin';
  }

  const tokenClaim = decoded as DecodedIdToken & {
    role?: unknown;
    super_admin?: unknown;
  };

  if (tokenClaim.super_admin === true || tokenClaim.role === 'super_admin') {
    return 'super_admin';
  }

  try {
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const documentRole = userDoc.exists ? userDoc.data()?.role : undefined;
    if (
      typeof documentRole === 'string' &&
      ROLE_HIERARCHY[documentRole] !== undefined
    ) {
      return documentRole;
    }
  } catch (error) {
    console.error('Could not read user role from Firestore:', error);
    throw new Error('Não foi possível validar as permissões do usuário.');
  }

  return 'viewer';
}

/**
 * Middleware factory shared by the Express server and the Cloud Function.
 * The middleware is intentionally kept identical in both runtimes.
 */
export function createAuthMiddleware({ db, auth }: ApiDependencies) {
  const verifyTokenAndRole = async (req: any, res: any, next: any) => {
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Não autenticado: token de acesso ausente.',
        code: 'unauthenticated',
      });
    }

    const idToken = authHeader.slice('Bearer '.length).trim();

    let decoded: DecodedIdToken;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (error: any) {
      console.error('Invalid Firebase ID token:', error?.message || error);
      return res.status(401).json({
        error: 'Sessão inválida ou expirada. Faça login novamente.',
        code: 'invalid-token',
      });
    }

    let role: string;
    try {
      role = await resolveRole(decoded, db);
    } catch (error: any) {
      return res.status(500).json({
        error:
          error?.message ||
          'Não foi possível validar as permissões do usuário.',
      });
    }

    req.user = { ...decoded, role } as AuthenticatedUser;
    return next();
  };

  const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Apenas Super Admins podem realizar esta ação.',
        code: 'forbidden',
      });
    }
    return next();
  };

  /**
   * Destructive operations require a recent authentication event. The client
   * reauthenticates with the password and forces a token refresh; Firebase
   * updates `auth_time`, which is verified here server-side.
   */
  const requireRecentAuth = (req: any, res: any, next: any) => {
    const authTime = Number(req.user?.auth_time || 0);
    const now = Math.floor(Date.now() / 1000);

    if (!authTime || now - authTime > MAX_AUTH_AGE_SECONDS) {
      return res.status(401).json({
        error:
          'Confirme sua senha de Super Admin novamente para executar esta ação.',
        code: 'reauth-required',
      });
    }

    return next();
  };

  return { verifyTokenAndRole, requireSuperAdmin, requireRecentAuth };
}
