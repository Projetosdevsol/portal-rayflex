import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'import' | 'config_change' | 'rollback' | 'unauthorized_access' | 'comment';

const getIPAddress = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    return 'unknown';
  }
};

export const logAction = async (
  action: AuditAction,
  entityType: string,
  entityId: string,
  before: any = null,
  after: any = null,
  details?: string,
  justification?: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'low'
) => {
  const user = auth.currentUser;
  if (!user) return;

  const ipAddress = await getIPAddress();
  const userAgent = navigator.userAgent;

  const log = {
    timestamp: serverTimestamp(),
    userId: user.uid,
    userEmail: user.email || 'unknown',
    action,
    entityType,
    entityId,
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    details: details || '',
    justification: justification || '',
    severity,
    ipAddress,
    userAgent,
    status: 'success'
  };

  try {
    await addDoc(collection(db, 'auditLogs'), log);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'auditLogs');
  }
};
