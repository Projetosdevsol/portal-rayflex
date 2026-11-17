import React from 'react';
import {
  getStatusBadgeStyle,
  getStatusLabel,
} from '../utils/status';

interface StatusBadgeProps {
  status: unknown;
  /** Optional override (e.g. feminine "Ativa" for units). */
  label?: string;
  className?: string;
}

/**
 * Standard status badge: green = healthy, yellow = attention, red = stopped.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  className = '',
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${className}`}
    style={getStatusBadgeStyle(status)}
    title={label || getStatusLabel(status)}
  >
    {label || getStatusLabel(status)}
  </span>
);
