import type { CustomerSector } from "@/entities/customer"
import type { ServiceLine } from "@/entities/tenant"

import type {
  MockAuditItem,
  MockAuditSection,
  MockAuditTemplate,
} from "../db/types"

type ItemSpec = [
  text: string,
  type: MockAuditItem["type"],
  weight: number,
  critical?: boolean,
  priority?: MockAuditItem["workOrderPriority"],
]

function sections(
  prefix: string,
  specs: [title: string, items: ItemSpec[]][]
): MockAuditSection[] {
  return specs.map(([title, items], sectionIndex) => ({
    id: `${prefix}-s${String(sectionIndex + 1)}`,
    title,
    items: items.map(
      ([text, type, weight, critical = false, priority], index) => ({
        id: `${prefix}-s${String(sectionIndex + 1)}-m${String(index + 1)}`,
        text,
        type,
        weight,
        critical,
        workOrderPriority: priority ?? (critical ? "high" : "normal"),
      })
    ),
  }))
}

interface LibraryTemplate {
  key: string
  name: string
  description: string
  serviceLine: ServiceLine
  sectors: CustomerSector[]
  sections: (prefix: string) => MockAuditSection[]
}

/** Platformun hazır şablon kütüphanesi. Her şablonda puanlı maddelerin ağırlık toplamı 100'dür. */
export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  {
    key: "cleaning-office",
    name: "Temizlik – Genel ofis",
    description:
      "Ofis, koridor, ıslak hacim ve ortak alanlar için haftalık denetim.",
    serviceLine: "cleaning",
    sectors: [],
    sections: (p) =>
      sections(p, [
        [
          "Islak hacimler",
          [
            ["Lavabo ve klozetler temiz", "yes_no", 15, true],
            ["Sarf malzemesi (sabun, havlu, kağıt) dolu", "yes_no", 15, true],
            ["Koku yok", "score_1_5", 10],
          ],
        ],
        [
          "Ofis ve koridorlar",
          [
            ["Zeminler temiz ve kuru", "score_1_5", 15],
            ["Çöp kutuları boşaltılmış", "yes_no", 10],
            ["Masa ve yüzeyler tozsuz", "score_1_5", 10],
          ],
        ],
        [
          "Personel ve ekipman",
          [
            ["Personel kıyafeti ve kartı uygun", "yes_no", 10],
            [
              "Temizlik arabası düzenli, kimyasallar etiketli",
              "photo_required",
              15,
            ],
            ["Gözlemler", "note", 0],
          ],
        ],
      ]),
  },
  {
    key: "cleaning-bank",
    name: "Temizlik – Banka şubesi",
    description: "Müşteri salonu, ATM alanı ve personel bölümleri.",
    serviceLine: "cleaning",
    sectors: ["bank"],
    sections: (p) =>
      sections(p, [
        [
          "Müşteri salonu",
          [
            ["Bekleme alanı ve gişeler temiz", "score_1_5", 20],
            ["Cam ve vitrinler lekesiz", "score_1_5", 15],
            ["Giriş paspası temiz", "yes_no", 10],
          ],
        ],
        [
          "ATM ve dış cephe",
          [["ATM alanı çöpsüz ve temiz", "photo_required", 20, true]],
        ],
        [
          "Personel alanları",
          [
            ["Islak hacim temiz, sarf dolu", "yes_no", 20, true],
            ["Mutfak / çay ocağı düzenli", "yes_no", 15],
            ["Notlar", "note", 0],
          ],
        ],
      ]),
  },
  {
    key: "cleaning-hospital",
    name: "Temizlik – Hastane",
    description:
      "Hasta odası, ameliyathane koridoru ve ıslak hacimlerde enfeksiyon kontrolüne yönelik denetim.",
    serviceLine: "cleaning",
    sectors: ["hospital"],
    sections: (p) =>
      sections(p, [
        [
          "Hasta odaları",
          [
            ["Yüzey dezenfeksiyonu yapılmış", "yes_no", 20, true, "urgent"],
            ["Renk kodlu bez/mop kullanımı doğru", "yes_no", 15, true, "high"],
            [
              "Tıbbi atık kutusu uygun doluluğa kadar",
              "yes_no",
              15,
              true,
              "urgent",
            ],
          ],
        ],
        [
          "Ortak alanlar",
          [
            ["Koridor zemini temiz ve kuru", "score_1_5", 15],
            ["Islak hacim temizliği", "score_1_5", 15],
          ],
        ],
        [
          "Kayıt ve personel",
          [
            ["Temizlik çizelgesi imzalı", "photo_required", 10],
            ["KKD (eldiven, maske) kullanımı", "yes_no", 10, true],
            ["Gözlemler", "note", 0],
          ],
        ],
      ]),
  },
  {
    key: "cleaning-airport",
    name: "Temizlik – Havalimanı terminali",
    description:
      "Terminal salonu, kapı bölgeleri ve yoğun kullanılan ıslak hacimler.",
    serviceLine: "cleaning",
    sectors: ["airport"],
    sections: (p) =>
      sections(p, [
        [
          "Terminal",
          [
            ["Salon zemini temiz", "score_1_5", 20],
            ["Oturma grupları ve kapı bölgeleri", "score_1_5", 15],
            ["Çöp ve geri dönüşüm üniteleri boş", "yes_no", 15],
          ],
        ],
        [
          "Islak hacimler",
          [
            ["Tuvaletler temiz, sarf dolu", "yes_no", 25, true, "urgent"],
            ["Koku yok", "score_1_5", 10],
          ],
        ],
        [
          "Güvenlik",
          [["Islak zemin uyarı levhası kullanımı", "photo_required", 15, true]],
        ],
      ]),
  },
  {
    key: "security-post",
    name: "Güvenlik – Nokta denetimi",
    description: "Nokta görevlisinin hazır bulunuşu, kayıtlar ve ekipman.",
    serviceLine: "security",
    sectors: [],
    sections: (p) =>
      sections(p, [
        [
          "Görevli",
          [
            ["Görevli noktasında", "yes_no", 25, true, "urgent"],
            ["Kıyafet ve kimlik kartı uygun", "yes_no", 15],
          ],
        ],
        [
          "Kayıtlar",
          [
            ["Ziyaretçi defteri güncel", "photo_required", 20],
            ["Devriye kayıtları eksiksiz", "yes_no", 20, true],
          ],
        ],
        [
          "Ekipman",
          [
            ["Telsiz ve el feneri çalışıyor", "yes_no", 20],
            ["Notlar", "note", 0],
          ],
        ],
      ]),
  },
  {
    key: "technical-periodic",
    name: "Teknik – Periyodik kontrol",
    description:
      "Aydınlatma, iklimlendirme ve tesisat için aylık saha kontrolü.",
    serviceLine: "technical",
    sectors: [],
    sections: (p) =>
      sections(p, [
        [
          "Elektrik ve aydınlatma",
          [
            ["Arızalı armatür yok", "yes_no", 20],
            ["Pano kapakları kapalı ve etiketli", "yes_no", 20, true, "urgent"],
          ],
        ],
        [
          "İklimlendirme",
          [
            ["Klima filtreleri temiz", "score_1_5", 20],
            ["Ortam sıcaklığı uygun", "score_1_5", 15],
          ],
        ],
        [
          "Tesisat",
          [
            ["Su kaçağı yok", "yes_no", 25, true, "urgent"],
            ["Gözlemler", "note", 0],
          ],
        ],
      ]),
  },
  {
    key: "landscaping",
    name: "Peyzaj – Saha denetimi",
    description: "Çim, bitki, sulama ve dış alan temizliği.",
    serviceLine: "landscaping",
    sectors: [],
    sections: (p) =>
      sections(p, [
        [
          "Bitki ve çim",
          [
            ["Çim biçimi zamanında", "score_1_5", 25],
            ["Bitkiler sağlıklı, budama yapılmış", "score_1_5", 25],
          ],
        ],
        [
          "Sulama ve temizlik",
          [
            ["Sulama sistemi çalışıyor", "yes_no", 30, true],
            ["Dış alan çöpsüz", "photo_required", 20],
          ],
        ],
      ]),
  },
]

export function buildAuditTemplates(
  tenantId: string,
  serviceLines: readonly ServiceLine[],
  publishedAt: string
): MockAuditTemplate[] {
  const library = TEMPLATE_LIBRARY.filter((template) =>
    serviceLines.includes(template.serviceLine)
  )
  const templates: MockAuditTemplate[] = library.map((template) => {
    const id = `ats-${tenantId}-${template.key}`
    return {
      id,
      tenantId,
      name: template.name,
      description: template.description,
      serviceLine: template.serviceLine,
      sectors: template.sectors,
      builtIn: true,
      isActive: true,
      versions: [
        {
          number: 1,
          publishedAt,
          publishedBy: "Platform kütüphanesi",
          sections: template.sections(id),
        },
      ],
      updatedAt: publishedAt,
    }
  })
  // Kiracıya ait, iki sürümlü örnek şablon (sürümleme ve düzenleme için)
  const office = TEMPLATE_LIBRARY[0]!
  if (serviceLines.includes("cleaning")) {
    const id = `ats-${tenantId}-firma-ofis`
    const v1 = office.sections(id)
    const v2 = structuredClone(v1)
    // 2. sürüm: "Koku yok" maddesi kritik oldu, ağırlıklar yeniden dağıtıldı
    v2[0]!.items[2]!.critical = true
    templates.push({
      id,
      tenantId,
      name: "Temizlik – Firma ofis standardı",
      description: "Genel ofis şablonundan çoğaltıldı; koku maddesi kritik.",
      serviceLine: "cleaning",
      sectors: [],
      builtIn: false,
      isActive: true,
      versions: [
        {
          number: 1,
          publishedAt,
          publishedBy: "Sistem",
          sections: v1,
        },
        {
          number: 2,
          publishedAt: "2026-08-15T10:00:00+03:00",
          publishedBy: "Sistem",
          sections: v2,
        },
      ],
      updatedAt: "2026-08-15T10:00:00+03:00",
    })
  }
  return templates
}
