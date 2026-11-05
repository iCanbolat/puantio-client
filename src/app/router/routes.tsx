import type { QueryClient } from "@tanstack/react-query"
import type { RouteObject } from "react-router"

import {
  authPageRoutes,
  createBootstrapMiddleware,
  createSessionGuard,
  type AuthController,
} from "@/features/auth"
import { attendanceRoutes } from "@/features/attendance"
import { customerRoutes } from "@/features/customer-management"
import { devShowcaseRoute } from "@/features/dev-showcase"
import { locationRoutes } from "@/features/location-management"
import { leaveRoutes } from "@/features/leave"
import { importRoute } from "@/features/master-data-import"
import { organizationRoutes } from "@/features/organization"
import { payrollRoutes } from "@/features/payroll-export"
import { personnelRoutes } from "@/features/personnel-management"
import { platformRoutes } from "@/features/platform-admin"
import { schedulingRoutes } from "@/features/scheduling"
import { tenantSettingsRoutes } from "@/features/tenant-settings"
import {
  CustomerTimesheetApprovals,
  timesheetRoutes,
} from "@/features/timesheet"
import { usersRolesRoutes } from "@/features/users-roles"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { scopeUiStoreToTenant } from "@/shared/stores/ui-store"

import { AuthLayout } from "../layouts/auth-layout"
import { PanelLayout } from "../layouts/panel-layout"
import { PlatformLayout } from "../layouts/platform-layout"
import { PortalLayout } from "../layouts/portal-layout"
import { PrintLayout } from "../layouts/print-layout"
import { PublicLayout } from "../layouts/public-layout"
import { RootLayout } from "../layouts/root-layout"
import { HomePage } from "../routes/home-page"
import {
  PortalHomePlaceholder,
  PublicFeedbackPlaceholder,
} from "../routes/placeholder-pages"
import { RootError } from "../routes/root-error"
import { RouteError } from "../routes/route-error"
import {
  ForbiddenPage,
  NotFoundPage,
  UpcomingModulePage,
} from "../routes/status-pages"
import { routePatterns } from "./paths"
import type { RouteHandle } from "./route-handle"

export interface RouteContext {
  queryClient: QueryClient
  auth: AuthController
  tenantSlug: string
  /** Bileşen vitrini ve geliştirici menüsü (yalnızca mock modunda) */
  showDevTools: boolean
}

const handle = (value: RouteHandle) => value

/** Sonraki fazların modülleri: yetki ve paket kontrolü bugünden uygulanır. */
const UPCOMING: {
  path: string
  title: string
  phase: string
  handle: RouteHandle
}[] = [
  {
    path: routePatterns.upcoming.contracts,
    title: "Sözleşmeler",
    phase: "3",
    handle: { permission: "contract:read", module: "contracts" },
  },
  {
    path: routePatterns.upcoming.progressPayment,
    title: "Hakediş",
    phase: "3",
    handle: { permission: "progress_payment:read", module: "contracts" },
  },
  {
    path: routePatterns.upcoming.quality,
    title: "Kalite denetimleri",
    phase: "4",
    handle: { permission: "quality:read", module: "quality" },
  },
  {
    path: routePatterns.upcoming.workOrders,
    title: "İş emirleri",
    phase: "4",
    handle: { permission: "work_order:read", module: "quality" },
  },
  {
    path: routePatterns.upcoming.inventory,
    title: "Stok ve zimmet",
    phase: "5",
    handle: { permission: "inventory:read", module: "inventory" },
  },
  {
    path: routePatterns.upcoming.shipments,
    title: "Sevkiyat",
    phase: "5",
    handle: { permission: "inventory:read", module: "inventory" },
  },
  {
    path: routePatterns.upcoming.ohs,
    title: "İSG ve özlük",
    phase: "6",
    handle: { permission: "ohs:read", module: "ohs" },
  },
  {
    path: routePatterns.upcoming.maintenance,
    title: "Teknik bakım",
    phase: "5b",
    handle: { module: "maintenance" },
  },
  {
    path: routePatterns.upcoming.security,
    title: "Güvenlik ve devriye",
    phase: "6b",
    handle: { module: "security_patrol" },
  },
]

export function createRoutes(context: RouteContext): RouteObject[] {
  const { queryClient, auth, tenantSlug, showDevTools } = context
  const guardContext = { auth, queryClient, tenantSlug }
  const authPages = authPageRoutes(guardContext)
  const personnel = personnelRoutes(queryClient)
  const locations = locationRoutes(queryClient)
  const customers = customerRoutes(queryClient)
  const organization = organizationRoutes()
  const usersRoles = usersRolesRoutes()
  const settings = tenantSettingsRoutes()
  const platform = platformRoutes()
  const scheduling = schedulingRoutes(queryClient)
  const leave = leaveRoutes()
  const attendance = attendanceRoutes(queryClient)
  const timesheet = timesheetRoutes(queryClient)
  const payroll = payrollRoutes()

  const panelChildren: RouteObject[] = [
    {
      index: true,
      Component: HomePage,
      handle: handle({ crumb: "Ana sayfa" }),
    },
    {
      path: routePatterns.personnelList,
      handle: handle({ crumb: "Personel", permission: "personnel:read" }),
      children: [
        { index: true, ...personnel.list },
        {
          path: routePatterns.personnelNew,
          handle: handle({
            crumb: "Yeni personel",
            permission: "personnel:write",
          }),
          ...personnel.create,
        },
        {
          path: routePatterns.personnelDetail,
          handle: handle({ crumb: "Personel kartı" }),
          ...personnel.detail,
        },
        {
          path: routePatterns.personnelEdit,
          handle: handle({ crumb: "Düzenle", permission: "personnel:write" }),
          ...personnel.edit,
        },
      ],
    },
    {
      path: routePatterns.locationList,
      handle: handle({
        crumb: ({ terms }) => terms.location.plural,
        permission: "location:read",
      }),
      children: [
        { index: true, ...locations.list },
        {
          path: routePatterns.locationNew,
          handle: handle({
            crumb: ({ terms }) => `Yeni ${terms.lower(terms.location)}`,
            permission: "location:write",
          }),
          ...locations.create,
        },
        {
          path: routePatterns.locationDetail,
          handle: handle({
            crumb: ({ terms }) => `${terms.location.singular} kartı`,
          }),
          ...locations.detail,
        },
        {
          path: routePatterns.locationEdit,
          handle: handle({ crumb: "Düzenle", permission: "location:write" }),
          ...locations.edit,
        },
      ],
    },
    {
      path: routePatterns.customerList,
      handle: handle({ crumb: "Müşteriler", permission: "customer:read" }),
      children: [
        { index: true, ...customers.list },
        {
          path: routePatterns.customerDetail,
          handle: handle({ crumb: "Müşteri kartı" }),
          ...customers.detail,
        },
      ],
    },
    {
      path: routePatterns.schedule,
      handle: handle({
        crumb: "Vardiya planlama",
        permission: "schedule:read",
        module: "attendance",
      }),
      children: [
        { index: true, ...scheduling.board },
        {
          path: routePatterns.scheduleTemplates,
          handle: handle({ crumb: "Şablonlar ve kurallar" }),
          ...scheduling.templates,
        },
      ],
    },
    {
      path: routePatterns.leave,
      handle: handle({
        crumb: "İzin ve raporlar",
        permission: "leave:read",
        module: "attendance",
      }),
      ...leave.list,
    },
    {
      path: routePatterns.attendanceLive,
      handle: handle({
        crumb: "Canlı yoklama",
        permission: "attendance:read",
        module: "attendance",
      }),
      children: [
        { index: true, ...attendance.live },
        {
          path: routePatterns.attendanceAlarms,
          handle: handle({ crumb: "Alarm merkezi" }),
          ...attendance.alarms,
        },
        {
          path: routePatterns.attendanceRecords,
          handle: handle({ crumb: "Yoklama kayıtları" }),
          ...attendance.records,
        },
      ],
    },
    {
      path: routePatterns.timesheet,
      handle: handle({
        crumb: "Puantaj",
        permission: "timesheet:read",
        module: "timesheet",
      }),
      children: [
        { index: true, ...timesheet.periods },
        {
          path: routePatterns.timesheetPeriod,
          handle: handle({ crumb: "Dönem" }),
          ...timesheet.period,
        },
      ],
    },
    {
      path: routePatterns.payroll,
      handle: handle({
        crumb: "Bordro aktarımı",
        permission: "payroll:export",
        module: "timesheet",
      }),
      children: [
        { index: true, ...payroll.exports },
        {
          path: routePatterns.payrollProfiles,
          handle: handle({ crumb: "Aktarım profilleri" }),
          ...payroll.profiles,
        },
      ],
    },
    {
      path: routePatterns.import,
      handle: handle({
        crumb: "Excel'den içe aktar",
        permission: "import:run",
      }),
      ...importRoute(),
    },
    {
      path: routePatterns.settingsTenant,
      handle: handle({
        crumb: "Firma ayarları",
        permission: "tenant:settings",
      }),
      ...settings.tenant,
    },
    {
      path: routePatterns.settingsAudit,
      handle: handle({ crumb: "Denetim kayıtları", permission: "audit:read" }),
      ...settings.audit,
    },
    {
      path: routePatterns.settingsUsers,
      handle: handle({ crumb: "Kullanıcılar", permission: "user:read" }),
      ...usersRoles.users,
    },
    {
      path: routePatterns.settingsRoles,
      handle: handle({ crumb: "Roller", permission: "role:write" }),
      ...usersRoles.roles,
    },
    {
      path: routePatterns.settingsLegalEntities,
      handle: handle({ crumb: "Tüzel kişilikler", permission: "org:read" }),
      ...organization.legalEntities,
    },
    {
      path: routePatterns.settingsOrgUnits,
      handle: handle({
        crumb: ({ terms }) => terms.orgLevels[0]?.plural ?? "Bölgeler",
        permission: "org:read",
      }),
      ...organization.orgUnits,
    },
    ...UPCOMING.map((item) => ({
      path: item.path,
      handle: handle({ crumb: item.title, ...item.handle }),
      element: <UpcomingModulePage title={item.title} phase={item.phase} />,
    })),
    {
      path: routePatterns.forbidden,
      Component: ForbiddenPage,
      handle: handle({ crumb: "Yetkisiz" }),
    },
    {
      path: "*",
      Component: NotFoundPage,
      handle: handle({ crumb: "Bulunamadı" }),
    },
  ]
  if (showDevTools) {
    panelChildren.push({
      path: routePatterns.devShowcase,
      handle: handle({ crumb: "Bileşen vitrini" }),
      ...devShowcaseRoute(queryClient),
    })
  }

  return [
    {
      id: "root",
      HydrateFallback: PageSkeleton,
      errorElement: <RootError />,
      // Kiracı yapılandırması ve kimlik adaptörü her şeyden önce hazırlanır
      middleware: [
        createBootstrapMiddleware(guardContext, (tenant) => {
          scopeUiStoreToTenant(tenant.slug)
        }),
      ],
      // Middleware'in çalışması için en az bir loader gerekir
      loader: () => null,
      Component: RootLayout,
      children: [
        {
          Component: AuthLayout,
          errorElement: <RouteError />,
          children: [
            { path: routePatterns.login, ...authPages.login },
            { path: routePatterns.loginCallback, ...authPages.callback },
            { path: routePatterns.accountPending, ...authPages.accountPending },
          ],
        },
        {
          id: "panel",
          middleware: [createSessionGuard(guardContext, "tenant")],
          loader: () => null,
          element: <PanelLayout showDevTools={showDevTools} />,
          errorElement: <RouteError />,
          // Hata sınırı layout'un içinde: menü ve üst bar hata durumunda da görünür kalır
          children: [{ errorElement: <RouteError />, children: panelChildren }],
        },
        {
          id: "print",
          middleware: [createSessionGuard(guardContext, "tenant")],
          loader: () => null,
          Component: PrintLayout,
          errorElement: <RouteError />,
          children: [
            {
              path: routePatterns.tagPrint,
              handle: handle({ permission: "location:read" }),
              ...locations.print,
            },
          ],
        },
        {
          id: "platform",
          path: routePatterns.platformHome,
          middleware: [createSessionGuard(guardContext, "platform")],
          loader: () => null,
          Component: PlatformLayout,
          errorElement: <RouteError />,
          handle: handle({ crumb: "Platform" }),
          children: [
            {
              errorElement: <RouteError />,
              children: [
                { index: true, ...platform.home },
                {
                  path: routePatterns.platformTenants,
                  handle: handle({
                    crumb: "Kiracılar",
                    permission: "platform:tenants",
                  }),
                  children: [
                    { index: true, ...platform.tenants },
                    {
                      path: routePatterns.platformTenantNew,
                      handle: handle({ crumb: "Yeni kiracı" }),
                      ...platform.newTenant,
                    },
                    {
                      path: routePatterns.platformTenantDetail,
                      handle: handle({ crumb: "Kiracı" }),
                      ...platform.tenantDetail,
                    },
                  ],
                },
                {
                  path: routePatterns.platformSupport,
                  handle: handle({
                    crumb: "Destek oturumları",
                    permission: "platform:support",
                  }),
                  ...platform.support,
                },
                { path: "*", Component: NotFoundPage },
              ],
            },
          ],
        },
        {
          path: routePatterns.portalHome,
          element: <PortalLayout />,
          errorElement: <RouteError />,
          children: [
            { index: true, Component: PortalHomePlaceholder },
            {
              id: "portal-session",
              middleware: [createSessionGuard(guardContext, "tenant")],
              loader: () => null,
              errorElement: <RouteError />,
              children: [
                {
                  path: routePatterns.portalTimesheet,
                  handle: handle({ permission: "timesheet:approve_customer" }),
                  Component: CustomerTimesheetApprovals,
                },
              ],
            },
          ],
        },
        {
          path: routePatterns.publicFeedback,
          element: <PublicLayout />,
          errorElement: <RouteError />,
          children: [{ index: true, Component: PublicFeedbackPlaceholder }],
        },
      ],
    },
  ]
}
