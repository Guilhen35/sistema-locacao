export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const GENERIC_ERROR = 'Não foi possível concluir a operação. Tente novamente.'

function readMessage(data: unknown): string | undefined {
  if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') {
    return data.message
  }
  return undefined
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

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
    const message = response.status >= 500 ? GENERIC_ERROR : (readMessage(data) ?? GENERIC_ERROR)
    throw new ApiError(response.status, message)
  }

  return data as T
}
