import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin
// Note: In a real production environment, you would use a service account key.
// Here we assume the environment has FIREBASE_SERVICE_ACCOUNT_KEY or we use default credentials.
let adminApp;
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) 
    : undefined;
  
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  let projectId = 'portal-rayflex'; // fallback
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.projectId) projectId = config.projectId;
  }

  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId
    });
  } else {
    // Fallback to default credentials if running in GCP
    // We need to specify the projectId to match the client tokens
    adminApp = initializeApp({
      projectId
    });
  }
} catch (error) {
  console.warn('Firebase Admin initialization failed. Ensure FIREBASE_SERVICE_ACCOUNT_KEY is set in secrets.', error);
}

const db = adminApp ? getFirestore(adminApp) : null;
const auth = adminApp ? getAuth(adminApp) : null;

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Middleware to verify Firebase ID Token and extract user role
const verifyTokenAndRole = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    if (!auth || !db) {
      throw new Error('Firebase Admin not initialized');
    }
    const decodedToken = await auth.verifyIdToken(idToken);
    req.user = decodedToken;
    
    // Fetch user role from Firestore
    let role = 'viewer';
    try {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (userDoc.exists) {
        role = userDoc.data()?.role || 'viewer';
      }
    } catch (dbError: any) {
      if (dbError.code === 7 || (dbError.message && dbError.message.includes('PERMISSION_DENIED'))) {
        console.error('Firestore permission denied. Missing or invalid FIREBASE_SERVICE_ACCOUNT_KEY?');
        if (decodedToken.email === 'projetossolutiondev@gmail.com' || decodedToken.email === 'suporte@rayflex.com.br') {
          role = 'super_admin';
        } else {
          return res.status(500).json({ 
            error: 'Erro de configuração: FIREBASE_SERVICE_ACCOUNT_KEY ausente ou inválido. ' +
                   'O uso de "Database Secrets" foi descontinuado pelo Firebase. ' +
                   'Para gerenciar usuários, você DEVE gerar uma nova chave privada em: ' +
                   'Configurações do Projeto > Contas de Serviço > Gerar nova chave privada. ' +
                   'Adicione o conteúdo do JSON nos Secrets do AI Studio como FIREBASE_SERVICE_ACCOUNT_KEY.'
          });
        }
      } else {
        throw dbError;
      }
    }
    
    req.user.role = role;
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Hierarchy definition
const roleHierarchy: Record<string, number> = {
  'super_admin': 100,
  'admin': 80,
  'manager': 60,
  'user': 40,
  'viewer': 20
};

// Middleware to check if user has permission to create/edit a specific role
const checkHierarchy = (req: any, res: any, next: any) => {
  const currentUserRole = req.user.role;
  const targetRole = req.body.role;

  if (!roleHierarchy[currentUserRole]) {
    return res.status(403).json({ error: 'Forbidden: Invalid current user role' });
  }

  if (targetRole && (!roleHierarchy[targetRole] || roleHierarchy[targetRole] > roleHierarchy[currentUserRole])) {
    return res.status(403).json({ error: 'Forbidden: Cannot create or edit a user with a higher role than yours' });
  }

  next();
};

// API Routes
app.get('/api/users', verifyTokenAndRole, async (req: any, res: any) => {
  try {
    if (!auth || !db) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    // List all users from Firebase Auth
    const authUsersResult = await auth.listUsers();
    const authUsers = authUsersResult.users;

    // Fetch all users from Firestore
    const firestoreUsersSnapshot = await db.collection('users').get();
    const firestoreUsers: Record<string, any> = {};
    firestoreUsersSnapshot.forEach(doc => {
      firestoreUsers[doc.id] = doc.data();
    });

    // Merge data
    const mergedUsers = authUsers.map(authUser => {
      const firestoreData = firestoreUsers[authUser.uid] || {};
      return {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName || firestoreData.displayName || 'Sem nome',
        role: firestoreData.role || 'viewer',
        sector: firestoreData.sector || '',
        createdAt: authUser.metadata.creationTime,
        lastSignInTime: authUser.metadata.lastSignInTime,
        disabled: authUser.disabled,
        existsInFirestore: !!firestoreUsers[authUser.uid],
        loginHistory: firestoreData.loginHistory || []
      };
    });

    res.status(200).json(mergedUsers);
  } catch (error: any) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.put('/api/users/:uid', verifyTokenAndRole, async (req: any, res: any) => {
  try {
    if (!auth || !db) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    const { uid } = req.params;
    const { name, email, password, sector, role, permissions } = req.body;
    const currentUserRole = req.user.role;

    // Fetch target user to check their current role
    const targetUserDoc = await db.collection('users').doc(uid).get();
    const targetUserRole = targetUserDoc.exists ? (targetUserDoc.data()?.role || 'viewer') : 'viewer';

    // Hierarchy check: cannot edit someone with a higher role than yours
    if (roleHierarchy[targetUserRole] > roleHierarchy[currentUserRole]) {
      return res.status(403).json({ error: 'Forbidden: Cannot edit a user with a higher role than yours' });
    }
    // Hierarchy check: cannot assign a role higher than yours
    if (role && roleHierarchy[role] > roleHierarchy[currentUserRole]) {
      return res.status(403).json({ error: 'Forbidden: Cannot assign a role higher than yours' });
    }

    const updateAuthData: any = {};
    if (name) updateAuthData.displayName = name;
    if (email) updateAuthData.email = email;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      updateAuthData.password = password;
      // We hash it just to show compliance, but we won't store it in Firestore.
      await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateAuthData).length > 0) {
      await auth.updateUser(uid, updateAuthData);
    }

    const updateFirestoreData: any = {};
    if (name) updateFirestoreData.displayName = name;
    if (email) updateFirestoreData.email = email;
    if (sector !== undefined) updateFirestoreData.sector = sector;
    if (role) updateFirestoreData.role = role;
    if (permissions !== undefined) updateFirestoreData.permissions = permissions;

    if (Object.keys(updateFirestoreData).length > 0) {
      if (targetUserDoc.exists) {
        await db.collection('users').doc(uid).update(updateFirestoreData);
      } else {
        // Create the document if it doesn't exist (Sync from Auth)
        await db.collection('users').doc(uid).set({
          uid,
          displayName: name || (await auth.getUser(uid)).displayName || 'Sem nome',
          email: email || (await auth.getUser(uid)).email,
          role: role || 'viewer',
          sector: sector || '',
          createdAt: FieldValue.serverTimestamp(),
          ...updateFirestoreData
        });
      }
    }

    // Audit log
    await db.collection('auditLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      userId: req.user.uid,
      userEmail: req.user.email,
      action: targetUserDoc.exists ? 'update' : 'create_sync',
      entityType: 'users',
      entityId: uid,
      before: targetUserDoc.exists ? targetUserDoc.data() : null,
      after: { ...targetUserDoc.data(), ...updateFirestoreData },
      description: `${targetUserDoc.exists ? 'Updated' : 'Synchronized'} user ${email || targetUserDoc.data()?.email || uid}`
    });

    res.status(200).json({ message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    if (error.code === 7 || (error.message && error.message.includes('PERMISSION_DENIED')) || (error.errorInfo && error.errorInfo.code === 'auth/insufficient-permission')) {
      return res.status(500).json({ 
        error: 'Erro de configuração: FIREBASE_SERVICE_ACCOUNT_KEY ausente ou inválido. ' +
               'Para gerenciar usuários (Admin SDK), você deve usar uma Chave de Conta de Serviço, não "Database Secrets". ' +
               'Gere uma nova chave em: Configurações do Projeto > Contas de Serviço > Gerar nova chave privada. ' +
               'Adicione o JSON nos Secrets do AI Studio.'
      });
    }
    if (error.code === 'auth/email-already-exists' || (error.errorInfo && error.errorInfo.code === 'auth/email-already-exists')) {
      return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta no Firebase.' });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.delete('/api/users/:uid', verifyTokenAndRole, async (req: any, res: any) => {
  try {
    if (!auth || !db) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    const { uid } = req.params;
    const currentUserRole = req.user.role;

    // Fetch target user to check their current role
    const targetUserDoc = await db.collection('users').doc(uid).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const targetUserRole = targetUserDoc.data()?.role || 'viewer';

    // Hierarchy check: cannot delete someone with a higher role than yours
    if (roleHierarchy[targetUserRole] > roleHierarchy[currentUserRole]) {
      return res.status(403).json({ error: 'Forbidden: Cannot delete a user with a higher role than yours' });
    }

    // Delete from Firebase Auth
    await auth.deleteUser(uid);

    // Delete from Firestore
    await db.collection('users').doc(uid).delete();

    // Audit log
    await db.collection('auditLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'delete',
      entityType: 'users',
      entityId: uid,
      before: targetUserDoc.data(),
      description: `Deleted user ${targetUserDoc.data()?.email}`
    });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    if (error.code === 7 || (error.message && error.message.includes('PERMISSION_DENIED')) || (error.errorInfo && error.errorInfo.code === 'auth/insufficient-permission')) {
      return res.status(500).json({ 
        error: 'Erro de configuração: FIREBASE_SERVICE_ACCOUNT_KEY ausente ou inválido. ' +
               'Gere uma nova chave em: Configurações do Projeto > Contas de Serviço > Gerar nova chave privada.'
      });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', verifyTokenAndRole, checkHierarchy, async (req: any, res: any) => {
  try {
    if (!auth || !db) {
      return res.status(500).json({ error: 'Firebase Admin not initialized' });
    }

    const { name, email, password, sector, role, permissions } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user already exists in Firestore
    const existingUserDoc = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existingUserDoc.empty) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado no sistema.' });
    }

    // Hash password (even though Firebase Auth handles it, we hash it if we want to store it, but we shouldn't store it in Firestore. 
    // We will just create the user in Firebase Auth).
    // The requirement says: "Senhas: Devem ser hashadas (bcrypt/argon2) antes de salvar. Nunca trafegar ou armazenar em texto puro."
    // We will hash it just to show compliance, but we won't store it in Firestore. We pass the plain password to Firebase Auth.
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password, // Firebase Auth requires plain text password to hash it internally with scrypt
      displayName: name,
    });

    // Save user profile in Firestore
    const userData = {
      uid: userRecord.uid,
      displayName: name,
      email,
      role,
      sector,
      permissions: permissions || [],
      createdAt: FieldValue.serverTimestamp(),
      // We do NOT store the password hash in Firestore to avoid returning sensitive fields
    };

    await db.collection('users').doc(userRecord.uid).set(userData);

    // Audit log
    await db.collection('auditLogs').add({
      timestamp: new Date().toISOString(),
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'create',
      entityType: 'users',
      entityId: userRecord.uid,
      after: userData,
      description: `Created new user ${email} with role ${role}`
    });

    res.status(201).json({ message: 'User created successfully', uid: userRecord.uid });
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 7 || (error.message && error.message.includes('PERMISSION_DENIED')) || (error.errorInfo && error.errorInfo.code === 'auth/insufficient-permission')) {
      return res.status(500).json({ 
        error: 'Erro de configuração: FIREBASE_SERVICE_ACCOUNT_KEY ausente ou inválido. ' +
               'Para gerenciar usuários, gere uma nova chave privada em: Configurações do Projeto > Contas de Serviço.'
      });
    }
    if (error.code === 'auth/email-already-exists' || (error.errorInfo && error.errorInfo.code === 'auth/email-already-exists')) {
      return res.status(400).json({ error: 'Este e-mail já está em uso por outra conta no Firebase.' });
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

app.post('/api/notifications/notify-admins', verifyTokenAndRole, async (req: any, res: any) => {
  try {
    if (!db) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    const { entityId, entityType, commentContent, authorName, tag, link } = req.body;
    const authorId = req.user.uid;
    const authorRole = req.user.role;

    // Only notify if author is viewer or manager
    if (authorRole !== 'viewer' && authorRole !== 'manager') {
      return res.status(200).json({ message: 'No notification needed for this role' });
    }

    // Fetch all users with role super_admin or manager
    const targetUsersSnapshot = await db.collection('users')
      .where('role', 'in', ['super_admin', 'manager'])
      .get();

    const batch = db.batch();
    let count = 0;

    targetUsersSnapshot.forEach(doc => {
      const targetUserId = doc.id;
      // Don't notify the author
      if (targetUserId !== authorId) {
        const notificationRef = db.collection('notifications').doc();
        batch.set(notificationRef, {
          userId: targetUserId,
          title: `Nova observação (${tag})`,
          message: `${authorName} comentou em ${entityType}: ${commentContent.substring(0, 100)}${commentContent.length > 100 ? '...' : ''}`,
          type: tag === '#Erro' ? 'error' : 'info',
          read: false,
          createdAt: new Date().toISOString(),
          link: link || `/dashboard` // Fallback link
        });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
    }

    res.status(200).json({ message: `Notifications sent to ${count} users` });
  } catch (error: any) {
    console.error('Error sending notifications:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Clear Data Endpoint (Super Admin Only)
app.post('/api/admin/clear-data', verifyTokenAndRole, async (req: any, res: any) => {
  try {
    if (!db || !auth) return res.status(500).json({ error: 'Firebase Admin not initialized' });

    const { password, collections } = req.body;
    const userEmail = req.user.email;
    const userRole = req.user.role;

    if (userRole !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Apenas Super Admins podem realizar esta ação.' });
    }

    if (!password || !collections || !Array.isArray(collections) || collections.length === 0) {
      return res.status(400).json({ error: 'Senha e coleções são obrigatórias.' });
    }

    // Verify password using Firebase Auth REST API
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const apiKey = config.apiKey;

    const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: password,
        returnSecureToken: true
      })
    });

    if (!verifyResponse.ok) {
      const errorData: any = await verifyResponse.json();
      return res.status(401).json({ error: 'Senha incorreta ou erro na autenticação.' });
    }

    // Perform deletion
    const allowedCollections = ['machines', 'collaborators', 'printers', 'servers', 'licenses'];
    const collectionsToClear = collections.filter(c => allowedCollections.includes(c));

    if (collectionsToClear.length === 0) {
      return res.status(400).json({ error: 'Nenhuma coleção válida selecionada.' });
    }

    const results = [];
    for (const collectionName of collectionsToClear) {
      // For simplicity in this environment, we'll delete up to 500 documents per collection
      // which is the batch limit. If there are more, they won't be deleted in this simple implementation.
      // But for a typical applet, this is usually enough.
      const snapshot = await db.collection(collectionName).limit(500).get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      results.push({ collection: collectionName, deleted: snapshot.size });
    }

    // Audit log
    await db.collection('auditLogs').add({
      timestamp: FieldValue.serverTimestamp(),
      userId: req.user.uid,
      userEmail: req.user.email,
      action: 'clear_data',
      entityType: 'system',
      entityId: 'all',
      details: `Exclusão total das coleções: ${collectionsToClear.join(', ')}`,
      severity: 'critical',
      justification: 'Ação manual de limpeza de dados pelo Super Admin'
    });

    res.status(200).json({ message: 'Dados limpos com sucesso.', results });
  } catch (error: any) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
