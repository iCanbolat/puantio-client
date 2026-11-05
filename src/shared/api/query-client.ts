import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryKey,
} from "@tanstack/react-query"

import {
  ApiError,
  ContractError,
  getErrorMessage,
  type AppError,
} from "./errors"

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: AppError
    queryMeta: {
      /** Arka plan yenileme hatasında gösterilecek özel mesaj */
      errorMessage?: string
      /** Toast gösterme (hata sayfada gösteriliyorsa) */
      silent?: boolean
    }
    mutationMeta: {
      errorMessage?: string
      successMessage?: string
      silent?: boolean
      /** Başarıdan sonra geçersiz kılınacak sorgular */
      invalidates?: readonly QueryKey[]
    }
  }
}

export interface Notifier {
  error: (message: string) => void
  success: (message: string) => void
}

const noopNotifier: Notifier = {
  error: () => undefined,
  success: () => undefined,
}

/**
 * Yeniden deneme politikası:
 * - Kontrat hatası: asla (tekrar denemek düzeltmez)
 * - 4xx: asla (408/429 hariç)
 * - Ağ/5xx: en fazla 2 kez
 */
export function shouldRetry(failureCount: number, error: AppError): boolean {
  if (error instanceof ContractError) return false
  if (
    error instanceof ApiError &&
    error.status < 500 &&
    ![408, 429].includes(error.status)
  ) {
    return false
  }
  return failureCount < 2
}

export function createQueryClient(
  notifier: Notifier = noopNotifier
): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (query.meta?.silent) return
        // İlk yüklemedeki hatalar sayfada gösterilir; toast yalnızca arka plan yenilemede
        if (query.state.data !== undefined) {
          notifier.error(query.meta?.errorMessage ?? getErrorMessage(error))
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        if (mutation.meta?.silent) return
        // 422 alan hataları formda gösterilir
        if (
          error instanceof ApiError &&
          error.status === 422 &&
          error.fieldErrors
        )
          return
        notifier.error(mutation.meta?.errorMessage ?? getErrorMessage(error))
      },
      onSuccess: async (
        _data,
        _variables,
        _onMutateResult,
        mutation,
        context
      ) => {
        if (mutation.meta?.successMessage)
          notifier.success(mutation.meta.successMessage)
        const keys = mutation.meta?.invalidates ?? []
        await Promise.all(
          keys.map((queryKey) => context.client.invalidateQueries({ queryKey }))
        )
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  })
}
