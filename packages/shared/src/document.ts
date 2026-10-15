export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

// CNPJ pode ter letras desde jul/2026 (CNPJ alfanumérico): mantém A-Z e 0-9
export function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeDocument(value);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;

  // Cada caractere vale o código ASCII menos 48 (regra da Receita para o CNPJ alfanumérico)
  const digit = (length: number) => {
    const weights = CNPJ_WEIGHTS.slice(13 - length);
    let sum = 0;
    for (let i = 0; i < length; i++) sum += (cnpj.charCodeAt(i) - 48) * (weights[i] ?? 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function formatDocument(document: string): string {
  if (document.length === 11) return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  if (document.length === 14) return document.replace(/^(.{2})(.{3})(.{3})(.{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  return document;
}

// LGPD: CPF aparece mascarado em listas. CNPJ é dado público da empresa
export function maskDocument(document: string): string {
  if (document.length === 11) return `***.${document.slice(3, 6)}.${document.slice(6, 9)}-**`;
  return formatDocument(document);
}