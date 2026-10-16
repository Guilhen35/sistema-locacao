export type FieldErrors = Record<string, string[]>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: FieldErrors

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMessage(data: unknown): string | undefined {
  return isRecord(data) && typeof data.message === 'string' ? data.message : undefined
}

// Aceita só o formato esperado: { campo: ["mensagem", ...] }
function readFieldErrors(data: unknown): FieldErrors {
  if (!isRecord(data) || !isRecord(data.errors)) return {}
  const result: FieldErrors = {}
  for (const [field, messages] of Object.entries(data.errors)) {
    if (Array.isArray(messages)) result[field] = messages.filter((m): m is string => typeof m === 'string')
  }
  return result
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.')
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    // Erro 500 nunca mostra detalhe interno para o usuário
    if (response.status >= 500) throw new ApiError(response.status, GENERIC_ERROR)
    if (response.status === 429) throw new ApiError(429, 'Muitas tentativas. Aguarde um minuto e tente de novo.')
    throw new ApiError(response.status, readMessage(data) ?? GENERIC_ERROR, readFieldErrors(data))
  }

  return data as T
}
