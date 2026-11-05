import {
  BadgeCheckIcon,
  BanknoteIcon,
  BoxesIcon,
  Building2Icon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  FileSignatureIcon,
  FileSpreadsheetIcon,
  FlaskConicalIcon,
  HardHatIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MapPinIcon,
  NetworkIcon,
  PlaneIcon,
  RadioTowerIcon,
  ReceiptTextIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  SirenIcon,
  TruckIcon,
  UserCogIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

import { can, type Me, type Permission } from "@/entities/session"
import {
  hasModule,
  type ModuleId,
  type TenantConfig,
  type Terms,
} from "@/entities/tenant"
import { paths } from "@/shared/config/paths"

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Tanımlı değilse menüde "Faz N" rozetiyle pasif gösterilir */
  to?: string
  phase: number | string
  permission?: Permission | readonly Permission[]
  module?: ModuleId
}

export interface NavSection {
  label: string
  items: NavItem[]
}

/**
 * Menü: geliştirilmemiş modüller hangi fazda geleceğini belirten rozetle pasif durur.
 * Kullanıcının yetkisi olmayan veya kiracının paketinde bulunmayan öğeler hiç gösterilmez.
 */
export function buildNavigation(options: {
  showDevTools: boolean
  terms: Terms
}): NavSection[] {
  const { terms } = options
  const orgLevel = terms.orgLevels[0]?.plural ?? "Bölgeler"
  const sections: NavSection[] = [
    {
      label: "Genel",
      items: [
        {
          label: "Ana sayfa",
          icon: LayoutDashboardIcon,
          to: paths.home(),
          phase: 0,
        },
      ],
    },
    {
      label: "Ana veri",
      items: [
        {
          label: "Personel",
          icon: UsersIcon,
          to: paths.personnel.list(),
          phase: 1,
          permission: "personnel:read",
        },
        {
          label: terms.location.plural,
          icon: MapPinIcon,
          to: paths.locations.list(),
          phase: 1,
          permission: "location:read",
        },
        {
          label: "Müşteriler",
          icon: Building2Icon,
          to: paths.customers.list(),
          phase: 1,
          permission: "customer:read",
        },
        {
          label: "Excel'den içe aktar",
          icon: FileSpreadsheetIcon,
          to: paths.import(),
          phase: 1,
          permission: "import:run",
        },
      ],
    },
    {
      label: "Saha operasyonu",
      items: [
        {
          label: "Canlı yoklama",
          icon: RadioTowerIcon,
          to: paths.attendance.live(),
          phase: 2,
          permission: "attendance:read",
          module: "attendance",
        },
        {
          label: "Alarm merkezi",
          icon: SirenIcon,
          to: paths.attendance.alarms(),
          phase: 2,
          permission: "attendance:read",
          module: "attendance",
        },
        {
          label: "Vardiya planlama",
          icon: CalendarClockIcon,
          to: paths.schedule.board(),
          phase: 2,
          permission: "schedule:read",
          module: "attendance",
        },
        {
          label: "İzin ve raporlar",
          icon: PlaneIcon,
          to: paths.leave(),
          phase: 2,
          permission: "leave:read",
          module: "attendance",
        },
        {
          label: "Yoklama kayıtları",
          icon: ListChecksIcon,
          to: paths.attendance.records(),
          phase: 2,
          permission: "attendance:read",
          module: "attendance",
        },
        {
          label: "Puantaj",
          icon: ClipboardCheckIcon,
          to: paths.timesheet.periods(),
          phase: 2,
          permission: "timesheet:read",
          module: "timesheet",
        },
        {
          label: "Bordro aktarımı",
          icon: BanknoteIcon,
          to: paths.payroll.exports(),
          phase: 2,
          permission: "payroll:export",
          module: "timesheet",
        },
      ],
    },
    {
      label: "Sözleşme ve hakediş",
      items: [
        {
          label: "Sözleşmeler",
          icon: FileSignatureIcon,
          phase: 3,
          permission: "contract:read",
          module: "contracts",
        },
        {
          label: "Hakediş",
          icon: ReceiptTextIcon,
          phase: 3,
          permission: "progress_payment:read",
          module: "contracts",
        },
      ],
    },
    {
      label: "Kalite",
      items: [
        {
          label: "Denetimler",
          icon: BadgeCheckIcon,
          phase: 4,
          permission: "quality:read",
          module: "quality",
        },
        {
          label: "İş emirleri",
          icon: WrenchIcon,
          phase: 4,
          permission: "work_order:read",
          module: "quality",
        },
      ],
    },
    {
      label: "Lojistik",
      items: [
        {
          label: "Stok ve zimmet",
          icon: BoxesIcon,
          phase: 5,
          permission: "inventory:read",
          module: "inventory",
        },
        {
          label: "Sevkiyat",
          icon: TruckIcon,
          phase: 5,
          permission: "inventory:read",
          module: "inventory",
        },
      ],
    },
    {
      label: "İSG ve özlük",
      items: [
        {
          label: "İSG ve özlük",
          icon: HardHatIcon,
          phase: 6,
          permission: "ohs:read",
          module: "ohs",
        },
      ],
    },
    {
      label: "Ek modüller",
      items: [
        {
          label: "Teknik bakım",
          icon: WrenchIcon,
          phase: "5b",
          module: "maintenance",
        },
        {
          label: "Güvenlik ve devriye",
          icon: ShieldIcon,
          phase: "6b",
          module: "security_patrol",
        },
      ],
    },
    {
      label: "Ayarlar",
      items: [
        {
          label: "Firma ayarları",
          icon: SettingsIcon,
          to: paths.settings.tenant(),
          phase: 1,
          permission: "tenant:settings",
        },
        {
          label: "Kullanıcılar",
          icon: UserCogIcon,
          to: paths.settings.users(),
          phase: 1,
          permission: "user:read",
        },
        {
          label: "Roller",
          icon: KeyRoundIcon,
          to: paths.settings.roles(),
          phase: 1,
          permission: "role:write",
        },
        {
          label: "Tüzel kişilikler",
          icon: LandmarkIcon,
          to: paths.settings.legalEntities(),
          phase: 1,
          permission: "org:read",
        },
        {
          label: orgLevel,
          icon: NetworkIcon,
          to: paths.settings.orgUnits(),
          phase: 1,
          permission: "org:read",
        },
        {
          label: "Denetim kayıtları",
          icon: ScrollTextIcon,
          to: paths.settings.audit(),
          phase: 1,
          permission: "audit:read",
        },
      ],
    },
  ]

  if (options.showDevTools) {
    sections.push({
      label: "Geliştirici",
      items: [
        {
          label: "Bileşen vitrini",
          icon: FlaskConicalIcon,
          to: paths.devShowcase(),
          phase: 0,
        },
      ],
    })
  }
  return sections
}

export function filterNavigation(
  sections: readonly NavSection[],
  context: { me: Me; tenant: TenantConfig }
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.module || hasModule(context.tenant, item.module)) &&
          (!item.permission || can(context.me, item.permission))
      ),
    }))
    .filter((section) => section.items.length > 0)
}

export function buildPlatformNavigation(): NavSection[] {
  return [
    {
      label: "Platform",
      items: [
        {
          label: "Genel bakış",
          icon: LayoutDashboardIcon,
          to: paths.platform.home(),
          phase: 1,
        },
        {
          label: "Kiracılar",
          icon: Building2Icon,
          to: paths.platform.tenants(),
          phase: 1,
          permission: "platform:tenants",
        },
        {
          label: "Destek oturumları",
          icon: ShieldIcon,
          to: paths.platform.support(),
          phase: 1,
          permission: "platform:support",
        },
      ],
    },
  ]
}
