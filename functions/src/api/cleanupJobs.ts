import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpError } from './errors.js';

/** Destructive cleanup scope approved for the platform. */
export const CLEARABLE_COLLECTIONS = [
  'machines',
  'collaborators',
  'printers',
  'ups',
  'servers',
  'licenses',
] as const;

export type ClearableCollection = (typeof CLEARABLE_COLLECTIONS)[number];

const CLEARABLE_COLLECTION_SET = new Set<string>(CLEARABLE_COLLECTIONS);

export const COLLECTION_LABELS: Record<string, string> = {
  machines: 'Computadores',
  collaborators: 'Colaboradores',
  printers: 'Impressoras',
  ups: 'Nobreaks',
  servers: 'Servidores',
  licenses: 'Licenças',
};

const JOBS_COLLECTION = 'dataCleanupJobs';
const AUDIT_LOGS_COLLECTION = 'auditLogs';

/** Firestore allows 500 writes per batch; keep headroom for safety. */
const BATCH_SIZE = 400;
/**
 * Hosting caps proxied function responses at 60s. Leave headroom for the
 * initial count queries and the final audit transaction, then resume.
 */
const TIME_BUDGET_MS = 35_000;
const LEASE_MS = 90_000;
const STALE_JOB_MS = 15 * 60 * 1000;

type CleanupJobStatus = 'running' | 'completed' | 'failed';

interface CleanupJob {
  status: CleanupJobStatus;
  requestedBy: string;
  requestedByEmail: string;
  collections: ClearableCollection[];
  results: Record<string, number>;
  totals: Record<string, number>;
  totalTarget: number;
  totalDeleted: number;
  currentIndex: number;
  currentCollection: string | null;
  error: string | null;
  leaseUntil: Timestamp | null;
  leaseToken: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  finishedAt: Timestamp | null;
}

export interface PublicCleanupStatus {
  jobId: string;
  status: CleanupJobStatus;
  collections: ClearableCollection[];
  results: Record<string, number>;
  totals: Record<string, number>;
  totalDeleted: number;
  totalTarget: number;
  progress: number;
  currentCollection: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  error: string | null;
  resumed?: boolean;
}

export interface CleanupRequester {
  uid: string;
  email?: string | null;
}

export function parseClearableCollections(input: unknown): ClearableCollection[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new HttpError(
      400,
      'Selecione pelo menos uma coleção para limpar.',
      'collections-required'
    );
  }

  const requested = input.map((value) => String(value));
  const invalid = requested.filter(
    (value) => !CLEARABLE_COLLECTION_SET.has(value)
  );

  if (invalid.length > 0) {
    throw new HttpError(
      400,
      `Coleção não permitida nesta operação: ${Array.from(
        new Set(invalid)
      ).join(', ')}.`,
      'collection-not-allowed'
    );
  }

  return Array.from(new Set(requested)) as ClearableCollection[];
}

function normalizeResults(job: CleanupJob): Record<string, number> {
  const results: Record<string, number> = {};
  for (const collection of job.collections || []) {
    results[collection] = job.results?.[collection] || 0;
  }
  return results;
}

export class CleanupService {
  constructor(private readonly db: Firestore) {}

  private jobRef(jobId: string) {
    return this.db.collection(JOBS_COLLECTION).doc(jobId);
  }

  async getJob(jobId: string): Promise<CleanupJob | null> {
    const snapshot = await this.jobRef(jobId).get();
    return snapshot.exists ? (snapshot.data() as CleanupJob) : null;
  }

  private toPublicStatus(jobId: string, job: CleanupJob): PublicCleanupStatus {
    const results = normalizeResults(job);
    const totalTarget = Number(job.totalTarget || 0);
    const totalDeleted = Number(job.totalDeleted || 0);
    const progress =
      totalTarget > 0
        ? Math.min(100, Math.round((totalDeleted / totalTarget) * 100))
        : job.status === 'completed'
        ? 100
        : 0;

    return {
      jobId,
      status: job.status,
      collections: job.collections || [],
      results,
      totals: job.totals || {},
      totalDeleted,
      totalTarget,
      progress,
      currentCollection: job.currentCollection || null,
      startedAt: job.createdAt?.toMillis?.() ?? null,
      finishedAt: job.finishedAt?.toMillis?.() ?? null,
      error: job.error || null,
    };
  }

  async getStatus(jobId: string, requester: CleanupRequester) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new HttpError(404, 'Limpeza de dados não encontrada.', 'not-found');
    }
    if (job.requestedBy !== requester.uid) {
      throw new HttpError(
        403,
        'Você não pode acompanhar esta limpeza de dados.',
        'forbidden'
      );
    }
    return this.toPublicStatus(jobId, job);
  }

  async continueJob(jobId: string, requester: CleanupRequester) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new HttpError(404, 'Limpeza de dados não encontrada.', 'not-found');
    }
    if (job.requestedBy !== requester.uid) {
      throw new HttpError(
        403,
        'Você não pode continuar esta limpeza de dados.',
        'forbidden'
      );
    }
    if (job.status !== 'running') {
      return { busy: false, status: this.toPublicStatus(jobId, job) };
    }

    const { busy } = await this.processJob(jobId);
    const fresh = await this.getJob(jobId);
    if (!fresh) {
      throw new HttpError(404, 'Limpeza de dados não encontrada.', 'not-found');
    }

    return { busy, status: this.toPublicStatus(jobId, fresh) };
  }

  async startJob(
    collections: ClearableCollection[],
    requester: CleanupRequester
  ): Promise<PublicCleanupStatus> {
    await this.purgeStaleJobs();

    const running = await this.findRunningJob();
    if (running) {
      const runningData = running.data() as CleanupJob;
      if (runningData.requestedBy === requester.uid) {
        await this.processJob(running.id);
        const resumed = await this.getJob(running.id);
        if (!resumed) {
          throw new HttpError(
            404,
            'Limpeza de dados não encontrada.',
            'not-found'
          );
        }
        return {
          ...this.toPublicStatus(running.id, resumed),
          resumed: true,
        };
      }

      throw new HttpError(
        409,
        'Já existe uma limpeza de dados em andamento por outro Super Admin.',
        'cleanup-in-progress'
      );
    }

    const totals: Record<string, number> = {};
    for (const collection of collections) {
      totals[collection] = await this.countDocuments(collection);
    }

    const totalTarget = collections.reduce(
      (sum, collection) => sum + (totals[collection] || 0),
      0
    );

    const jobRef = this.db.collection(JOBS_COLLECTION).doc();
    const results: Record<string, number> = {};
    for (const collection of collections) results[collection] = 0;

    await jobRef.set({
      status: 'running',
      requestedBy: requester.uid,
      requestedByEmail: requester.email || '',
      collections,
      results,
      totals,
      totalTarget,
      totalDeleted: 0,
      currentIndex: 0,
      currentCollection: collections[0] || null,
      error: null,
      leaseUntil: null,
      leaseToken: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      finishedAt: null,
    });

    await this.processJob(jobRef.id);
    const job = await this.getJob(jobRef.id);
    if (!job) {
      throw new Error('A limpeza foi criada, mas não pôde ser lida.');
    }

    return this.toPublicStatus(jobRef.id, job);
  }

  private async countDocuments(collectionName: string): Promise<number> {
    try {
      const snapshot = await this.db.collection(collectionName).count().get();
      return Number(snapshot.data().count || 0);
    } catch (error) {
      console.warn(`Could not count documents in ${collectionName}:`, error);
      return 0;
    }
  }

  private async purgeStaleJobs() {
    const snapshot = await this.db
      .collection(JOBS_COLLECTION)
      .where('status', '==', 'running')
      .limit(20)
      .get();

    const now = Date.now();

    for (const doc of snapshot.docs) {
      const job = doc.data() as CleanupJob;
      const updatedAt = job.updatedAt?.toMillis?.() || 0;

      // A pending server timestamp resolves on the next read; skip it instead
      // of killing a job that was just created.
      if (!updatedAt || now - updatedAt <= STALE_JOB_MS) continue;

      await this.failJob(
        doc.id,
        'Limpeza expirada por inatividade. Nenhum novo documento foi removido.'
      );
    }
  }

  private async findRunningJob(): Promise<any | null> {
    const snapshot = await this.db
      .collection(JOBS_COLLECTION)
      .where('status', '==', 'running')
      .limit(10)
      .get();

    const now = Date.now();

    for (const doc of snapshot.docs) {
      const job = doc.data() as CleanupJob;
      const updatedAt = job.updatedAt?.toMillis?.() || 0;

      if (!updatedAt || now - updatedAt <= STALE_JOB_MS) {
        return doc;
      }

      await this.failJob(
        doc.id,
        'Limpeza expirada por inatividade. Nenhum novo documento foi removido.'
      );
    }

    return null;
  }

  private async acquireLease(jobId: string, leaseToken: string) {
    const ref = this.jobRef(jobId);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new HttpError(
          404,
          'Limpeza de dados não encontrada.',
          'not-found'
        );
      }

      const job = snapshot.data() as CleanupJob;
      if (job.status !== 'running') return 'not-running' as const;

      const leaseUntil = job.leaseUntil?.toMillis?.() || 0;
      if (leaseUntil > Date.now()) return 'busy' as const;

      transaction.update(ref, {
        leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS),
        leaseToken,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return 'acquired' as const;
    });
  }

  private async releaseLease(jobId: string, leaseToken: string) {
    const ref = this.jobRef(jobId);

    await this.db
      .runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return;

        const job = snapshot.data() as CleanupJob;
        if (job.leaseToken !== leaseToken) return;

        transaction.update(ref, {
          leaseUntil: null,
          leaseToken: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      })
      .catch((error) => {
        console.warn(`Could not release lease for cleanup ${jobId}:`, error);
      });
  }

  async processJob(jobId: string): Promise<{ busy: boolean }> {
    const leaseToken = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    const lease = await this.acquireLease(jobId, leaseToken);
    if (lease === 'busy') return { busy: true };
    if (lease === 'not-running') return { busy: false };

    const deadline = Date.now() + TIME_BUDGET_MS;
    const ref = this.jobRef(jobId);

    try {
      while (Date.now() < deadline) {
        const snapshot = await ref.get();
        if (!snapshot.exists) break;

        const job = snapshot.data() as CleanupJob;
        if (job.status !== 'running') break;

        let index = Number(job.currentIndex || 0);
        if (index >= job.collections.length) {
          await this.completeJob(jobId);
          break;
        }

        const collectionName = job.collections[index];
        const documents = await this.db
          .collection(collectionName)
          .limit(BATCH_SIZE)
          .get();

        if (documents.empty) {
          index += 1;
          const nextCollection =
            index < job.collections.length ? job.collections[index] : null;

          await ref.update({
            currentIndex: index,
            currentCollection: nextCollection,
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (index >= job.collections.length) {
            await this.completeJob(jobId);
            break;
          }
          continue;
        }

        const results = { ...(job.results || {}) };
        results[collectionName] =
          (results[collectionName] || 0) + documents.size;
        const totalDeleted = (job.totalDeleted || 0) + documents.size;

        // Deletions and the progress counters are committed atomically, so a
        // crash between the commit and a follow-up update cannot under-report
        // the audit counts.
        const batch = this.db.batch();
        documents.docs.forEach((document) => batch.delete(document.ref));
        batch.update(ref, {
          results,
          totalDeleted,
          currentIndex: index,
          currentCollection: collectionName,
          updatedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();
      }
    } catch (error: any) {
      const message =
        typeof error?.message === 'string'
          ? error.message.slice(0, 500)
          : 'Erro desconhecido durante a limpeza.';
      await this.failJob(jobId, message);
      throw error;
    } finally {
      await this.releaseLease(jobId, leaseToken);
    }

    return { busy: false };
  }

  private async completeJob(jobId: string) {
    const ref = this.jobRef(jobId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;

      const job = snapshot.data() as CleanupJob;
      if (job.status !== 'running') return;

      const results = normalizeResults(job);
      const totalDeleted = Number(job.totalDeleted || 0);
      const collectionsText = job.collections
        .map(
          (collection) =>
            `${COLLECTION_LABELS[collection] || collection} (${
              results[collection] || 0
            })`
        )
        .join(', ');

      const auditRef = this.db.collection(AUDIT_LOGS_COLLECTION).doc();
      transaction.set(auditRef, {
        timestamp: FieldValue.serverTimestamp(),
        userId: job.requestedBy,
        userEmail: job.requestedByEmail || '',
        action: 'clear_data',
        entityType: 'system',
        entityId: jobId,
        details: `Limpeza de dados concluída. Coleções: ${collectionsText}. Total removido: ${totalDeleted}.`,
        description: 'Limpeza de dados executada por Super Admin',
        collections: job.collections,
        results,
        totalDeleted,
        before: null,
        after: {
          collections: job.collections,
          results,
          totalDeleted,
        },
        justification:
          'Ação manual de limpeza de dados pelo Super Admin',
        severity: 'critical',
        status: 'success',
      });

      transaction.update(ref, {
        status: 'completed',
        results,
        totalDeleted,
        currentIndex: job.collections.length,
        currentCollection: null,
        finishedAt: FieldValue.serverTimestamp(),
        leaseUntil: null,
        leaseToken: null,
        error: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  private async failJob(jobId: string, message: string) {
    const ref = this.jobRef(jobId);

    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;

      const job = snapshot.data() as CleanupJob;
      if (job.status !== 'running') return;

      const results = normalizeResults(job);
      const totalDeleted = Number(job.totalDeleted || 0);
      const auditRef = this.db.collection(AUDIT_LOGS_COLLECTION).doc();

      transaction.set(auditRef, {
        timestamp: FieldValue.serverTimestamp(),
        userId: job.requestedBy,
        userEmail: job.requestedByEmail || '',
        action: 'clear_data',
        entityType: 'system',
        entityId: jobId,
        details: `Limpeza de dados falhou após remover ${totalDeleted} registro(s). Erro: ${message}`,
        description: 'Falha na limpeza de dados executada por Super Admin',
        collections: job.collections,
        results,
        totalDeleted,
        before: null,
        after: {
          collections: job.collections,
          results,
          totalDeleted,
        },
        justification:
          'Ação manual de limpeza de dados pelo Super Admin',
        severity: 'critical',
        status: 'failed',
        error: message,
      });

      transaction.update(ref, {
        status: 'failed',
        error: message,
        results,
        finishedAt: FieldValue.serverTimestamp(),
        leaseUntil: null,
        leaseToken: null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
}
