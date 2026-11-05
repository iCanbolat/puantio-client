import { useSuspenseQuery } from "@tanstack/react-query"
import { useContext } from "react"

import { toLowerTr } from "@/shared/lib/format"

import { tenantQueries } from "../api/tenant-api"
import type {
  ModuleId,
  Term,
  TenantConfig,
  Terminology,
} from "../model/tenant-config"
import { TenantSlugContext } from "./tenant-slug-context"

export function useTenantSlug(): string {
  const slug = useContext(TenantSlugContext)
  if (!slug) throw new Error("TenantSlugProvider eksik")
  return slug
}

/** Aktif kiracının yapılandırması. Kök loader önceden yüklediği için askıya almaz. */
export function useTenant(): TenantConfig {
  const slug = useTenantSlug()
  return useSuspenseQuery(tenantQueries.config(slug)).data
}

export function useHasModule(module: ModuleId): boolean {
  return hasModule(useTenant(), module)
}

export function hasModule(config: TenantConfig, module: ModuleId): boolean {
  return module === "core" || config.modules.includes(module)
}

export interface Terms extends Terminology {
  /** "Lokasyon" → "lokasyon" (cümle içi kullanım) */
  lower: (term: Term, plural?: boolean) => string
}

export function buildTerms(terminology: Terminology): Terms {
  return {
    ...terminology,
    lower: (term, plural = false) =>
      toLowerTr(plural ? term.plural : term.singular),
  }
}

/** Kiracının kavram adları: "Bölge/Proje/Lokasyon/Alan". UI metinleri buradan okunur. */
export function useTerms(): Terms {
  return buildTerms(useTenant().terminology)
}
