export class HttpError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function isPermissionDenied(error: any): boolean {
  return (
    error?.code === 7 ||
    (typeof error?.message === 'string' &&
      error.message.includes('PERMISSION_DENIED')) ||
    error?.errorInfo?.code === 'auth/insufficient-permission'
  );
}

export function isEmailAlreadyExists(error: any): boolean {
  return (
    error?.code === 'auth/email-already-exists' ||
    error?.errorInfo?.code === 'auth/email-already-exists'
  );
}

export const ADMIN_CONFIG_ERROR =
  'Erro de configuração: FIREBASE_SERVICE_ACCOUNT_KEY ausente ou inválido. ' +
  'Gere uma nova chave em: Configurações do Projeto > Contas de Serviço > ' +
  'Gerar nova chave privada e configure-a nos Secrets do ambiente.';

export function sendFirebaseError(res: any, error: any, context: string) {
  console.error(`Error ${context}:`, error);

  if (isPermissionDenied(error)) {
    return res.status(500).json({ error: ADMIN_CONFIG_ERROR });
  }

  if (isEmailAlreadyExists(error)) {
    return res.status(400).json({
      error: 'Este e-mail já está em uso por outra conta no Firebase.',
    });
  }

  return res
    .status(500)
    .json({ error: error?.message || 'Erro interno do servidor.' });
}
