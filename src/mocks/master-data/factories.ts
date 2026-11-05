import { CUSTOMER_SECTORS, type CustomerSector } from "@/entities/customer"
import type { AreaType, CertificateType } from "@/entities/location"
import type { Position } from "@/entities/personnel"
import type { ServiceLine } from "@/entities/tenant"

import {
  SEED_REFERENCE_DATE,
  TR_CITIES,
  faker,
  randomPointNear,
} from "../factories/faker"
import {
  fakeNfcUid,
  fakeQrToken,
  fakeSgkNumber,
  fakeTckn,
  fakeTrMobile,
  fakeVkn,
} from "../factories/identity"
import type { MockTenant } from "../tenancy/tenants"
import type {
  MockArea,
  MockCustomer,
  MockLegalEntity,
  MockLocation,
  MockOrgUnit,
  MockPersonnel,
  MockTag,
} from "../db/types"

export interface MasterDataSizes {
  personnel: number
  locations: number
  customers: number
  maxAreas: number
}

const iso = (date: Date) => date.toISOString()

const LEGAL_ENTITIES: Record<string, string[]> = {
  "temizlik-orta": ["Lavanta Temizlik Hizmetleri A.Ş."],
  "cok-hatli-grup": [
    "Çınar Temizlik ve Hizmet A.Ş.",
    "Çınar Teknik Hizmetler A.Ş.",
    "Çınar Peyzaj ve Bahçe Ltd. Şti.",
  ],
  guvenlik: ["Kalkan Özel Güvenlik A.Ş."],
  "entegre-buyuk": [
    "Atlas Entegre Tesis Yönetimi A.Ş.",
    "Atlas Güvenlik Hizmetleri A.Ş.",
  ],
}

const TAX_OFFICES = [
  "Kozyatağı",
  "Büyük Mükellefler",
  "Kadıköy",
  "Bornova",
  "Çankaya",
]

/** Bölge ağacı: kök bölgeler ve (2 seviyeli kiracılarda) alt bölgeler */
const REGION_TREE: {
  code: string
  name: string
  children: { code: string; name: string; cities: string[] }[]
}[] = [
  {
    code: "MAR",
    name: "Marmara",
    children: [
      { code: "IST-AVR", name: "İstanbul Avrupa", cities: ["İstanbul"] },
      { code: "IST-AND", name: "İstanbul Anadolu", cities: ["İstanbul"] },
      {
        code: "BRS",
        name: "Bursa ve Çanakkale",
        cities: ["Bursa", "Çanakkale"],
      },
    ],
  },
  {
    code: "EGE",
    name: "Ege",
    children: [
      { code: "IZM", name: "İzmir", cities: ["İzmir"] },
      { code: "MUG", name: "Muğla", cities: ["Muğla"] },
    ],
  },
  {
    code: "IAN",
    name: "İç Anadolu",
    children: [
      { code: "ANK", name: "Ankara", cities: ["Ankara"] },
      {
        code: "KON",
        name: "Konya ve Kayseri",
        cities: ["Konya", "Kayseri", "Eskişehir"],
      },
    ],
  },
  {
    code: "AKD",
    name: "Akdeniz ve Güneydoğu",
    children: [
      { code: "ANT", name: "Antalya", cities: ["Antalya"] },
      {
        code: "ADA",
        name: "Adana ve Gaziantep",
        cities: ["Adana", "Gaziantep", "Şanlıurfa", "Diyarbakır"],
      },
    ],
  },
  {
    code: "KRD",
    name: "Karadeniz",
    children: [
      { code: "SAM", name: "Samsun ve Trabzon", cities: ["Samsun", "Trabzon"] },
    ],
  },
]

const CUSTOMER_PREFIX: Record<
  CustomerSector,
  { names: string[]; suffix: string; type: "public" | "private" }
> = {
  bank: {
    names: [
      "Anadolu Katılım",
      "Boğaziçi",
      "Ege Yatırım",
      "Kuzey Kredi",
      "Toros",
    ],
    suffix: "Bankası",
    type: "private",
  },
  hospital: {
    names: ["Yeşilvadi", "Şifa", "Park Tıp", "Sahil"],
    suffix: "Hastanesi",
    type: "private",
  },
  airport: {
    names: ["Bölge", "Kıyı", "Yayla"],
    suffix: "Havalimanı İşletmesi",
    type: "public",
  },
  public_building: {
    names: [
      "İl Sağlık Müdürlüğü",
      "Vergi Dairesi Başkanlığı",
      "Adalet Komisyonu",
      "SGK İl Müdürlüğü",
    ],
    suffix: "",
    type: "public",
  },
  office: {
    names: ["Kule", "Vadi", "Nova", "Atlas", "Meridyen"],
    suffix: "Plaza Yönetimi",
    type: "private",
  },
  mall: {
    names: ["Panorama", "Liman", "Köşk"],
    suffix: "AVM",
    type: "private",
  },
  factory: {
    names: ["Demir Döküm", "Ege Tekstil", "Kuzey Otomotiv"],
    suffix: "Fabrikası",
    type: "private",
  },
  hotel: {
    names: ["Mavi Koy", "Lale", "Sedir"],
    suffix: "Otel",
    type: "private",
  },
  education: {
    names: ["Bilge", "Yıldız", "Çamlıca"],
    suffix: "Üniversitesi",
    type: "private",
  },
  logistics: {
    names: ["Hızlı", "Merkez", "Transit"],
    suffix: "Lojistik Deposu",
    type: "private",
  },
  other: { names: ["Kent", "Ova"], suffix: "Hizmet Binası", type: "private" },
}

const DISTRICTS: Record<string, string[]> = {
  İstanbul: [
    "Şişli",
    "Kadıköy",
    "Beşiktaş",
    "Ümraniye",
    "Bakırköy",
    "Ataşehir",
    "Sarıyer",
  ],
  Ankara: ["Çankaya", "Yenimahalle", "Keçiören", "Etimesgut"],
  İzmir: ["Konak", "Bornova", "Karşıyaka", "Bayraklı"],
}

const LOCATION_PREFIX: Record<string, string> = {
  "temizlik-orta": "LOK",
  "cok-hatli-grup": "PRJ",
  guvenlik: "GRV",
  "entegre-buyuk": "TES",
}

const POSITIONS_BY_LINE: Record<ServiceLine, Position[]> = {
  cleaning: [
    "cleaning_staff",
    "cleaning_staff",
    "cleaning_staff",
    "cleaning_lead",
    "supervisor",
  ],
  security: [
    "security_guard",
    "security_guard",
    "security_guard",
    "security_lead",
  ],
  technical: ["technician"],
  landscaping: ["gardener"],
  pest_control: ["pest_technician"],
  catering: ["kitchen_staff"],
  reception: ["receptionist"],
  laundry: ["laundry_staff"],
  staffing: ["office_support", "driver"],
}

const AREA_BY_LINE: Record<string, { type: AreaType; name: string }[]> = {
  default: [
    { type: "restroom", name: "Kadın tuvaleti" },
    { type: "restroom", name: "Erkek tuvaleti" },
    { type: "lobby", name: "Giriş lobisi" },
    { type: "kitchen", name: "Çay ocağı" },
    { type: "meeting", name: "Toplantı salonu" },
    { type: "corridor", name: "Koridor" },
    { type: "dining", name: "Yemekhane" },
    { type: "office", name: "Açık ofis" },
  ],
  security: [
    { type: "checkpoint", name: "Ana giriş" },
    { type: "checkpoint", name: "Otopark girişi" },
    { type: "checkpoint", name: "Arka kapı" },
    { type: "checkpoint", name: "Çatı erişimi" },
  ],
}

const CERTS_BY_SECTOR: Partial<Record<CustomerSector, CertificateType[]>> = {
  hospital: ["hygiene", "hospital_infection"],
  airport: ["airport_permit"],
  factory: ["work_at_height"],
  hotel: ["food_handling"],
}

function buildOrgUnits(tenant: MockTenant): MockOrgUnit[] {
  const twoLevels = tenant.terminology.orgLevels.length === 2
  const regions =
    tenant.slug === "temizlik-orta" ? REGION_TREE.slice(0, 3) : REGION_TREE
  const units: MockOrgUnit[] = []
  for (const region of regions) {
    const regionId = `ou-${tenant.slug}-${region.code}`
    units.push({
      id: regionId,
      tenantId: tenant.slug,
      level: 0,
      parentId: null,
      code: region.code,
      name: region.name,
      isActive: true,
      cities: region.children.flatMap((child) => child.cities),
    })
    if (!twoLevels) continue
    for (const child of region.children) {
      units.push({
        id: `ou-${tenant.slug}-${child.code}`,
        tenantId: tenant.slug,
        level: 1,
        parentId: regionId,
        code: child.code,
        name: child.name,
        isActive: true,
        cities: child.cities,
      })
    }
  }
  return units
}

function sectorsFor(tenant: MockTenant): CustomerSector[] {
  if (tenant.slug === "guvenlik")
    return ["bank", "mall", "factory", "logistics", "office", "public_building"]
  return [...CUSTOMER_SECTORS].filter((sector) => sector !== "other")
}

export interface TenantMasterData {
  legalEntities: MockLegalEntity[]
  orgUnits: MockOrgUnit[]
  customers: MockCustomer[]
  locations: MockLocation[]
  areas: MockArea[]
  tags: MockTag[]
  personnel: MockPersonnel[]
}

export function buildTenantMasterData(
  tenant: MockTenant,
  sizes: MasterDataSizes
): TenantMasterData {
  const slug = tenant.slug
  const created = iso(faker.date.past({ years: 2 }))

  const legalEntities: MockLegalEntity[] = (
    LEGAL_ENTITIES[slug] ?? [tenant.displayName]
  ).map((title, index) => ({
    id: `le-${slug}-${index + 1}`,
    tenantId: slug,
    title,
    taxNumber: fakeVkn(),
    taxOffice: faker.helpers.arrayElement(TAX_OFFICES),
    sgkWorkplaceNumbers: [fakeSgkNumber()],
    eInvoiceEnabled: index === 0,
    address: `${faker.location.street()} No:${faker.number.int({ min: 1, max: 120 })}, İstanbul`,
    isActive: true,
    createdAt: created,
    // Çok hatlı grupta ikinci şirket farklı bordro profili kullanır (TC-2.6-06)
    payrollProfileId: `pp-${slug}-${index === 1 ? "generic" : "logo"}`,
  }))

  const orgUnits = buildOrgUnits(tenant)
  const leafLevel = tenant.terminology.orgLevels.length - 1
  const leaves = orgUnits.filter((unit) => unit.level === leafLevel)

  const sectors = sectorsFor(tenant)
  const customers: MockCustomer[] = Array.from(
    { length: sizes.customers },
    (_, index) => {
      const sector = sectors[index % sectors.length] ?? "office"
      const parts = CUSTOMER_PREFIX[sector]
      const city = faker.helpers.arrayElement(TR_CITIES).name
      const base = faker.helpers.arrayElement(parts.names)
      const name = [
        base,
        sector === "public_building" ? city : null,
        parts.suffix,
      ]
        .filter(Boolean)
        .join(" ")
      return {
        id: `cus-${slug}-${index + 1}`,
        tenantId: slug,
        code: `MUS-${String(index + 1).padStart(4, "0")}`,
        name: sizes.customers > 40 ? `${name} ${index + 1}` : name,
        type: parts.type,
        sector,
        taxNumber: fakeVkn(),
        taxOffice: faker.helpers.arrayElement(TAX_OFFICES),
        contacts: [
          {
            name: faker.person.fullName(),
            title: faker.helpers.arrayElement([
              "İdari İşler Müdürü",
              "Satın Alma Uzmanı",
              "Tesis Müdürü",
            ]),
            phone: `0${faker.string.numeric(3)} ${faker.string.numeric(3)} ${faker.string.numeric(2)} ${faker.string.numeric(2)}`,
            email: `iletisim${index + 1}@musteri.example`,
            isPrimary: true,
          },
        ],
        status: faker.helpers.weightedArrayElement([
          { weight: 9, value: "active" as const },
          { weight: 1, value: "passive" as const },
        ]),
        updatedAt: iso(faker.date.recent({ days: 90 })),
      }
    }
  )

  const prefix = LOCATION_PREFIX[slug] ?? "LOK"
  const lines =
    tenant.serviceLines.length > 0
      ? tenant.serviceLines
      : (["cleaning"] as ServiceLine[])
  const locations: MockLocation[] = Array.from(
    { length: sizes.locations },
    (_, index) => {
      const unit = leaves[index % leaves.length] ?? leaves[0]!
      const cityName = faker.helpers.arrayElement(unit.cities)
      const city =
        TR_CITIES.find((item) => item.name === cityName) ?? TR_CITIES[0]
      const district = faker.helpers.arrayElement(
        DISTRICTS[cityName] ?? ["Merkez"]
      )
      const customer = customers[index % customers.length]!
      const serviceLines = faker.helpers.arrayElements(lines, {
        min: 1,
        max: Math.min(2, lines.length),
      })
      return {
        id: `loc-${slug}-${index + 1}`,
        tenantId: slug,
        code: `${prefix}-${String(index + 1).padStart(5, "0")}`,
        name: `${customer.name} ${district}`,
        customerId: customer.id,
        orgUnitId: unit.id,
        serviceLines,
        address: {
          city: cityName,
          district,
          line: `${faker.location.street()} No:${faker.number.int({ min: 1, max: 200 })}`,
        },
        geofence: {
          center: randomPointNear(city, 10),
          radiusMeters: faker.helpers.arrayElement([50, 75, 100, 150, 200]),
        },
        workingHours: {
          days: slug === "guvenlik" ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5],
          start: slug === "guvenlik" ? "00:00" : "07:00",
          end: slug === "guvenlik" ? "23:59" : "19:00",
        },
        targetHeadcount: faker.number.int({ min: 1, max: 40 }),
        requiredCertificates:
          slug === "guvenlik"
            ? ["security_id"]
            : (CERTS_BY_SECTOR[customer.sector] ?? []),
        status: faker.helpers.weightedArrayElement([
          { weight: 19, value: "active" as const },
          { weight: 1, value: "passive" as const },
        ]),
        updatedAt: iso(faker.date.recent({ days: 60 })),
      }
    }
  )

  const areaCatalog =
    slug === "guvenlik" ? AREA_BY_LINE.security! : AREA_BY_LINE.default!
  const areas: MockArea[] = []
  const tags: MockTag[] = []
  const tag = (
    targetType: "location" | "area",
    targetId: string,
    locationId: string,
    kind: "qr" | "nfc"
  ): MockTag => ({
    id: `tag-${slug}-${tags.length + 1}`,
    tenantId: slug,
    targetType,
    targetId,
    locationId,
    kind,
    value: kind === "qr" ? fakeQrToken() : fakeNfcUid(),
    status: "active",
    createdAt: created,
    revokedAt: null,
  })
  for (const location of locations) {
    tags.push(tag("location", location.id, location.id, "qr"))
    const count = faker.number.int({ min: 1, max: sizes.maxAreas })
    const picks = faker.helpers.arrayElements(
      areaCatalog,
      Math.min(count, areaCatalog.length)
    )
    picks.forEach((pick, index) => {
      const area: MockArea = {
        id: `area-${location.id}-${index + 1}`,
        tenantId: slug,
        locationId: location.id,
        name: pick.name,
        type: pick.type,
        floor: faker.helpers.arrayElement(["Zemin", "1", "2", "B1", null]),
      }
      areas.push(area)
      tags.push(tag("area", area.id, location.id, "qr"))
      if (faker.datatype.boolean({ probability: 0.4 }))
        tags.push(tag("area", area.id, location.id, "nfc"))
    })
  }

  const personnel: MockPersonnel[] = Array.from(
    { length: sizes.personnel },
    (_, index) => {
      const serviceLine = faker.helpers.arrayElement(lines)
      const status = faker.helpers.weightedArrayElement([
        { weight: 85, value: "active" as const },
        { weight: 8, value: "passive" as const },
        { weight: 7, value: "terminated" as const },
      ])
      const hire = faker.date.past({ years: 6 })
      const isFloater = faker.datatype.boolean({ probability: 0.1 })
      const location = isFloater ? null : faker.helpers.arrayElement(locations)
      const sex = faker.helpers.arrayElement([
        "female",
        "female",
        "female",
        "male",
      ] as const)
      return {
        id: `per-${slug}-${index + 1}`,
        tenantId: slug,
        employeeNumber: `S${String(index + 1).padStart(5, "0")}`,
        firstName: faker.person.firstName(sex),
        lastName: faker.person.lastName(),
        tckn: fakeTckn(),
        phone: faker.datatype.boolean({ probability: 0.95 })
          ? fakeTrMobile()
          : null,
        position: faker.helpers.arrayElement(POSITIONS_BY_LINE[serviceLine]),
        serviceLine,
        legalEntityId: faker.helpers.arrayElement(legalEntities).id,
        homeLocationId: location?.id ?? null,
        isFloater,
        status,
        hireDate: hire.toISOString().slice(0, 10),
        terminationDate:
          status === "terminated"
            ? faker.date
                .between({ from: hire, to: SEED_REFERENCE_DATE })
                .toISOString()
                .slice(0, 10)
            : null,
        updatedAt: iso(faker.date.recent({ days: 120 })),
      }
    }
  )

  return {
    legalEntities,
    orgUnits,
    customers,
    locations,
    areas,
    tags,
    personnel,
  }
}
