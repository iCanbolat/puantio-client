/**
 * Tipli yol üreticileri. Uygulama içinde string literal URL yazılmaz; her zaman bu
 * fonksiyonlar kullanılır. Route tanımları da `routePatterns` üzerinden aynı kaynağı paylaşır.
 * Feature'lar birbirine bağlantı verebilsin diye `shared` katmanındadır.
 */
export const routePatterns = {
  home: "/",
  forbidden: "/yetkisiz",
  login: "/giris",
  loginCallback: "/giris/geri-donus",
  accountPending: "/hesap-yetkisiz",
  devShowcase: "/gelistirici/bilesenler",
  portalHome: "/portal",
  publicFeedback: "/q/:token",
  personnelList: "/personel",
  personnelNew: "/personel/yeni",
  personnelDetail: "/personel/:personnelId",
  personnelEdit: "/personel/:personnelId/duzenle",
  locationList: "/lokasyonlar",
  locationNew: "/lokasyonlar/yeni",
  locationDetail: "/lokasyonlar/:locationId",
  locationEdit: "/lokasyonlar/:locationId/duzenle",
  tagPrint: "/etiket-baski",
  customerList: "/musteriler",
  customerDetail: "/musteriler/:customerId",
  import: "/ice-aktar",
  settingsTenant: "/ayarlar/firma",
  settingsUsers: "/ayarlar/kullanicilar",
  settingsRoles: "/ayarlar/roller",
  settingsLegalEntities: "/ayarlar/tuzel-kisilikler",
  settingsOrgUnits: "/ayarlar/bolgeler",
  settingsAudit: "/ayarlar/denetim-kayitlari",
  platformHome: "/platform",
  platformTenants: "/platform/kiracilar",
  platformTenantNew: "/platform/kiracilar/yeni",
  platformTenantDetail: "/platform/kiracilar/:tenantSlug",
  platformSupport: "/platform/destek-oturumlari",
  schedule: "/vardiya",
  scheduleTemplates: "/vardiya/sablonlar",
  leave: "/izinler",
  attendanceLive: "/yoklama",
  attendanceAlarms: "/yoklama/alarmlar",
  attendanceRecords: "/yoklama/kayitlar",
  timesheet: "/puantaj",
  timesheetPeriod: "/puantaj/:periodId",
  payroll: "/bordro",
  payrollProfiles: "/bordro/profiller",
  portalTimesheet: "/portal/puantaj-onaylari",
  upcoming: {
    contracts: "/sozlesmeler",
    progressPayment: "/hakedis",
    quality: "/kalite",
    workOrders: "/is-emirleri",
    inventory: "/stok",
    shipments: "/sevkiyat",
    ohs: "/isg",
    maintenance: "/bakim",
    security: "/guvenlik",
  },
} as const

const withQuery = (path: string, query: Record<string, string | undefined>) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `${path}?${search}` : path
}

const enc = encodeURIComponent

export type LoginReason = "oturum-suresi" | "kiraci-uyusmazligi" | "cikis"

export const paths = {
  home: () => routePatterns.home,
  forbidden: () => routePatterns.forbidden,
  login: (options: { returnTo?: string; reason?: LoginReason } = {}) =>
    withQuery(routePatterns.login, {
      donus:
        options.returnTo && options.returnTo !== routePatterns.home
          ? options.returnTo
          : undefined,
      neden: options.reason,
    }),
  loginCallback: () => routePatterns.loginCallback,
  accountPending: (reason?: "destek") =>
    withQuery(routePatterns.accountPending, { neden: reason }),
  devShowcase: () => routePatterns.devShowcase,
  portal: {
    home: () => routePatterns.portalHome,
  },
  publicFeedback: (token: string) => `/q/${enc(token)}`,
  personnel: {
    list: () => routePatterns.personnelList,
    new: () => routePatterns.personnelNew,
    detail: (id: string) => `/personel/${enc(id)}`,
    edit: (id: string) => `/personel/${enc(id)}/duzenle`,
  },
  locations: {
    list: () => routePatterns.locationList,
    new: () => routePatterns.locationNew,
    detail: (id: string, tab?: string) =>
      withQuery(`/lokasyonlar/${enc(id)}`, { sekme: tab }),
    edit: (id: string) => `/lokasyonlar/${enc(id)}/duzenle`,
  },
  tagPrint: (locationIds: readonly string[]) => {
    const params = new URLSearchParams()
    for (const id of locationIds) params.append("lokasyon", id)
    return `${routePatterns.tagPrint}?${params.toString()}`
  },
  schedule: {
    board: (query: { locationId?: string; date?: string } = {}) =>
      withQuery(routePatterns.schedule, {
        lokasyon: query.locationId,
        tarih: query.date,
      }),
    templates: () => routePatterns.scheduleTemplates,
  },
  leave: () => routePatterns.leave,
  attendance: {
    live: () => routePatterns.attendanceLive,
    alarms: (status?: "aktif" | "eskale" | "cozulen") =>
      withQuery(routePatterns.attendanceAlarms, { durum: status }),
    records: (query: { anomaly?: string } = {}) =>
      withQuery(routePatterns.attendanceRecords, { anomaly: query.anomaly }),
  },
  timesheet: {
    periods: () => routePatterns.timesheet,
    period: (id: string, query: { orgUnitId?: string } = {}) =>
      withQuery(`/puantaj/${enc(id)}`, { orgUnitId: query.orgUnitId }),
  },
  payroll: {
    exports: (periodId?: string) =>
      withQuery(routePatterns.payroll, { donem: periodId }),
    profiles: () => routePatterns.payrollProfiles,
  },
  customers: {
    list: () => routePatterns.customerList,
    detail: (id: string) => `/musteriler/${enc(id)}`,
  },
  import: (entity?: string) => withQuery(routePatterns.import, { tur: entity }),
  settings: {
    tenant: () => routePatterns.settingsTenant,
    users: () => routePatterns.settingsUsers,
    roles: () => routePatterns.settingsRoles,
    legalEntities: () => routePatterns.settingsLegalEntities,
    orgUnits: () => routePatterns.settingsOrgUnits,
    audit: () => routePatterns.settingsAudit,
  },
  platform: {
    home: () => routePatterns.platformHome,
    tenants: () => routePatterns.platformTenants,
    newTenant: () => routePatterns.platformTenantNew,
    tenant: (slug: string) => `/platform/kiracilar/${enc(slug)}`,
    support: () => routePatterns.platformSupport,
  },
} as const
