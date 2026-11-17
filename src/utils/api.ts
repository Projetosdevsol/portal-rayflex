export class ApiError extends Error {
  status: number;
  code?: string;
  data?: any;

  constructor(
    message: string,
    status: number,
    code?: string,
    data?: any
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const HTML_RESPONSE_MESSAGE =
  'O backend não respondeu com JSON. Verifique se as Cloud Functions foram publicadas e se o rewrite /api/** está ativo no Firebase Hosting.';

/**
 * Reads an API response without ever assuming it is JSON. Firebase Hosting's
 * SPA rewrite used to return index.html for `/api/*`, which produced the
 * cryptic `Unexpected token '<'` error.
 */
export async function parseApiResponse<T = any>(
  response: Response
): Promise<T> {
  const raw = await response.text();
  let data: any = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      const trimmed = raw.trimStart().toLowerCase();
      const isHtml =
        trimmed.startsWith('<!doctype') ||
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<');

      throw new ApiError(
        isHtml ? HTML_RESPONSE_MESSAGE : 'Resposta inválida do servidor.',
        response.status || 0,
        'invalid-json'
      );
    }
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || data?.message || `Erro ${response.status}`,
      response.status,
      data?.code,
      data
    );
  }

  return data as T;
}

export async function apiFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch (error) {
    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
      0,
      'network-error'
    );
  }

  return parseApiResponse<T>(response);
}

const PERMISSION_MESSAGE =
  'Acesso negado. Verifique se o seu perfil possui permissão e se as regras do Firestore estão publicadas.';

/**
 * Extracts a readable message from API/Firestore errors. `handleFirestoreError`
 * throws a JSON string, so we parse it instead of showing raw JSON in a toast.
 */
export function getErrorMessage(
  error: unknown,
  fallback = 'Não foi possível concluir a operação.'
): string {
  if (error instanceof ApiError) return error.message || fallback;

  if (error instanceof Error) {
    const message = error.message || '';
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) {
        const parsedMessage = String(parsed.error);
        if (
          parsedMessage.includes('Missing or insufficient permissions') ||
          parsedMessage.includes('PERMISSION_DENIED')
        ) {
          return PERMISSION_MESSAGE;
        }
        return parsedMessage;
      }
    } catch {
      // Not JSON: fall through to the raw message.
    }

    if (
      message.includes('Missing or insufficient permissions') ||
      message.includes('PERMISSION_DENIED')
    ) {
      return PERMISSION_MESSAGE;
    }

    return message || fallback;
  }

  if (typeof error === 'string' && error.trim()) return error;

  return fallback;
}
