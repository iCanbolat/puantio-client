export {
  AUTH_PROVIDER_KINDS,
  DEFAULT_LABOR_RULES,
  MODULES,
  MODULE_IDS,
  SERVICE_LINES,
  SERVICE_LINE_LABELS,
  authProviderSchema,
  laborRulesSchema,
  moduleIdSchema,
  serviceLineSchema,
  tenantBrandingSchema,
  tenantConfigSchema,
  tenantRulesSchema,
  tenantSlugSchema,
  termSchema,
  terminologySchema,
  type AuthProvider,
  type LaborRules,
  type ModuleId,
  type ServiceLine,
  type Term,
  type TenantAuth,
  type TenantBranding,
  type TenantConfig,
  type TenantRules,
  type Terminology,
} from "./model/tenant-config"
export { fetchTenantConfig, tenantKeys, tenantQueries } from "./api/tenant-api"
export {
  PLATFORM_SLUG,
  RESERVED_SLUGS,
  buildTenantUrl,
  resolveTenantSlug,
} from "./lib/tenant-host"
export { applyBranding, documentTitle, resolveBrandColor } from "./lib/branding"
export { tenantInitials } from "./lib/initials"
export {
  buildTerms,
  hasModule,
  useHasModule,
  useTenant,
  useTenantSlug,
  useTerms,
  type Terms,
} from "./ui/tenant-hooks"
export { TenantLogo } from "./ui/tenant-logo"
export { TenantSlugProvider } from "./ui/tenant-slug-provider"
