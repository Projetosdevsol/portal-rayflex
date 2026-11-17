/**
 * Integração com a Brasil API (https://brasilapi.com.br):
 * - CEP: busca de endereço (v2 com fallback para v1)
 * - CNPJ: consulta de dados cadastrais / validação de existência
 */

export interface CepResult {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

export interface CnpjResult {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export const onlyDigits = (value: string = '') => value.replace(/\D/g, '');

export const formatCnpj = (value: string = '') => {
  const d = onlyDigits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export const formatCep = (value: string = '') => {
  const d = onlyDigits(value).slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
};

/**
 * Valida os dígitos verificadores do CNPJ (módulo 11).
 * Não garante existência na Receita — apenas que o número é matematicamente válido.
 */
export const isValidCnpjChecksum = (value: string = ''): boolean => {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) sum += Number(base[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calcDigit(cnpj.slice(0, 12), w1);
  if (d1 !== Number(cnpj[12])) return false;

  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d2 = calcDigit(cnpj.slice(0, 13), w2);
  return d2 === Number(cnpj[13]);
};

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* mantém mensagem padrão */
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }

  return res.json();
}

/** Busca endereço pelo CEP. Tenta v2 e cai para v1 se necessário. */
export const fetchAddressByCep = async (cep: string): Promise<CepResult> => {
  const clean = onlyDigits(cep);
  if (clean.length !== 8) throw new Error('CEP deve conter 8 dígitos.');

  const normalize = (data: any): CepResult => ({
    cep: data.cep || clean,
    state: data.state || data.uf || '',
    city: data.city || data.cidade || '',
    neighborhood: data.neighborhood || data.bairro || '',
    street: data.street || data.logradouro || '',
  });

  try {
    return normalize(await fetchJson(`https://brasilapi.com.br/api/cep/v2/${clean}`));
  } catch {
    return normalize(await fetchJson(`https://brasilapi.com.br/api/cep/v1/${clean}`));
  }
};

export type CnpjStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'offline';

export interface CnpjCheck {
  status: CnpjStatus;
  message: string;
  data?: CnpjResult;
}

/**
 * Valida o CNPJ em duas etapas:
 * 1. Dígitos verificadores (local, instantâneo);
 * 2. Existência na Brasil API (retorna razão social e situação cadastral).
 * Se a API estiver fora do ar, retorna status 'offline' (permite salvar com aviso).
 */
export const checkCnpj = async (cnpj: string): Promise<CnpjCheck> => {
  const clean = onlyDigits(cnpj);
  if (!clean) return { status: 'idle', message: '' };
  if (clean.length !== 14) return { status: 'invalid', message: 'CNPJ deve conter 14 dígitos.' };
  if (!isValidCnpjChecksum(clean)) return { status: 'invalid', message: 'CNPJ inválido (dígitos verificadores).' };

  try {
    const data = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
    const logradouro = [data.descricao_tipo_de_logradouro, data.logradouro]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      status: 'valid',
      message: `${data.razao_social || 'Empresa encontrada'} • Situação: ${data.descricao_situacao_cadastral || '—'}`,
      data: {
        cnpj: data.cnpj || clean,
        razaoSocial: data.razao_social || '',
        nomeFantasia: data.nome_fantasia || '',
        situacaoCadastral: data.descricao_situacao_cadastral || '',
        logradouro,
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        cep: data.cep || '',
      },
    };
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const isAbort =
      error instanceof Error && error.name === 'AbortError';

    // Network/timeout/5xx/429: the external API failed, not the CNPJ.
    // The unit must still be saved with a yellow warning.
    if (
      error instanceof TypeError ||
      isAbort ||
      status === 408 ||
      status === 429 ||
      (typeof status === 'number' && status >= 500)
    ) {
      return {
        status: 'offline',
        message:
          'Brasil API indisponível no momento. Os dígitos do CNPJ são válidos; a unidade pode ser salva e o CNPJ confirmado depois.',
      };
    }

    // A definitive 404/400 means the number was not found in the Receita.
    if (status === 404 || status === 400) {
      return {
        status: 'invalid',
        message: `CNPJ não encontrado na base da Receita (${error instanceof Error ? error.message : 'verifique o número'}).`,
      };
    }

    // Any other unexpected failure is treated as offline so it never blocks
    // saving a unit because of an external dependency.
    return {
      status: 'offline',
      message:
        'Não foi possível confirmar o CNPJ na Brasil API. Dígitos válidos; a unidade pode ser salva com este aviso.',
    };
  }
};
