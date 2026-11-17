/**
 * Central PT-BR status dictionary.
 *
 * Every asset, unit, task and audit status used by the UI is translated here so
 * tables, detail drawers, filters and badges always show the same wording and
 * the same semantic colour.
 */

import type { CSSProperties } from 'react';

export type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

export interface StatusDefinition {
  label: string;
  tone: StatusTone;
}

/**
 * Canonical status keys are kept in English (the values stored in Firestore).
 * The label is the only thing the user sees.
 */
const STATUS_DICTIONARY: Record<string, StatusDefinition> = {
  // Assets / units
  active: { label: 'Ativo', tone: 'success' },
  inactive: { label: 'Inativo', tone: 'warning' },
  deactivated: { label: 'Desativado', tone: 'error' },
  available: { label: 'Disponível', tone: 'success' },
  'in-use': { label: 'Em Uso', tone: 'success' },
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'error' },
  maintenance: { label: 'Em Manutenção', tone: 'warning' },
  retired: { label: 'Baixado', tone: 'error' },

  // Tasks / jobs
  pending: { label: 'Pendente', tone: 'warning' },
  'in-progress': { label: 'Em Andamento', tone: 'warning' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'error' },
  running: { label: 'Em Execução', tone: 'warning' },
  failed: { label: 'Falhou', tone: 'error' },
  failure: { label: 'Falha', tone: 'error' },
  success: { label: 'Sucesso', tone: 'success' },
  idle: { label: 'Ocioso', tone: 'neutral' },
};

const TONE_STYLES: Record<
  StatusTone,
  { color: string; backgroundColor: string; borderColor: string }
> = {
  success: {
    color: 'var(--status-completed-text)',
    backgroundColor: 'var(--status-completed-bg)',
    borderColor: 'var(--status-success)',
  },
  warning: {
    color: 'var(--status-pending-text)',
    backgroundColor: 'var(--status-pending-bg)',
    borderColor: 'var(--status-warning)',
  },
  error: {
    color: 'var(--status-cancelled-text)',
    backgroundColor: 'var(--status-cancelled-bg)',
    borderColor: 'var(--status-error)',
  },
  neutral: {
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-secondary)',
    borderColor: 'var(--border-color)',
  },
};

/** Removes accents/punctuation so spreadsheet values can be compared safely. */
export const normalizeStatusKey = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

const STATUS_ALIASES: Record<string, string> = {
  ativo: 'active',
  ativado: 'active',
  ativa: 'active',
  inativo: 'inactive',
  inativa: 'inactive',
  desativado: 'deactivated',
  desativada: 'deactivated',
  disponivel: 'available',
  'em uso': 'in-use',
  emuso: 'in-use',
  manutencao: 'maintenance',
  'em manutencao': 'maintenance',
  baixado: 'retired',
  aposentado: 'retired',
  online: 'online',
  offline: 'offline',
  pendente: 'pending',
  'em andamento': 'in-progress',
  andamento: 'in-progress',
  concluido: 'completed',
  concluida: 'completed',
  cancelado: 'cancelled',
  cancelada: 'cancelled',
  sucesso: 'success',
  falha: 'failure',
  falhou: 'failed',
  ocioso: 'idle',
};

/**
 * Converts a spreadsheet/legacy value ("Ativado", "Em Manutenção", "in-use")
 * into the canonical key stored in Firestore.
 */
export const normalizeStatusValue = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const key = normalizeStatusKey(raw);
  if (STATUS_DICTIONARY[key]) return key;
  if (STATUS_ALIASES[key]) return STATUS_ALIASES[key];

  return raw;
};

export const getStatusDefinition = (status: unknown): StatusDefinition => {
  const key = normalizeStatusValue(status);
  return (
    STATUS_DICTIONARY[key] ?? {
      label: key ? key.charAt(0).toUpperCase() + key.slice(1) : '—',
      tone: 'neutral',
    }
  );
};

export const getStatusLabel = (status: unknown): string =>
  getStatusDefinition(status).label;

export const getStatusTone = (status: unknown): StatusTone =>
  getStatusDefinition(status).tone;

export const getStatusColor = (status: unknown): string =>
  TONE_STYLES[getStatusTone(status)].color;

export const getStatusBadgeStyle = (
  status: unknown
): CSSProperties => {
  const style = TONE_STYLES[getStatusTone(status)];
  return {
    color: style.color,
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
  };
};
