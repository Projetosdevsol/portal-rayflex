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
  const res = await fetch(url);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* mantém mensagem padrão */
    }
    throw new Error(message);
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
    return {
      status: 'valid',
      message: `${data.razao_social || 'Empresa encontrada'} • Situação: ${data.descricao_situacao_cadastral || '—'}`,
      data: {
        cnpj: data.cnpj || clean,
        razaoSocial: data.razao_social || '',
        nomeFantasia: data.nome_fantasia || '',
        situacaoCadastral: data.descricao_situacao_cadastral || '',
        logradouro: data.logradouro || data.descricao_tipo_de_logradouro
          ? `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro || ''}`.trim()
          : '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        cep: data.cep || '',
      },
    };
  } catch (error) {
    if (error instanceof TypeError) {
      // Falha de rede (fetch) — API possivelmente fora do ar
      return { status: 'offline', message: 'Não foi possível consultar a Brasil API. Dígitos válidos; confirme o número manualmente.' };
    }
    return { status: 'invalid', message: `CNPJ não encontrado na base (${error instanceof Error ? error.message : 'verifique o número'}).` };
  }
};
