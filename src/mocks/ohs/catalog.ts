import type { CertificateType } from "@/entities/location"
import type { TrainingType } from "@/entities/ohs"

import type { MockDocumentType } from "../db/types"

/** Hazır eğitim türleri (kiracı çoğaltır, düzenler, pasife alır) */
export const DEFAULT_TRAINING_TYPES: TrainingType[] = [
  {
    id: "temel-isg",
    name: "Temel İSG eğitimi",
    renewal: { kind: "hazard_class" },
    requiredFor: [],
    isActive: true,
  },
  {
    id: "hijyen",
    name: "Hijyen eğitimi",
    renewal: { kind: "months", months: 12 },
    requiredFor: ["hygiene", "food_handling"],
    isActive: true,
  },
  {
    id: "enfeksiyon",
    name: "Hastane enfeksiyon kontrolü",
    renewal: { kind: "months", months: 12 },
    requiredFor: ["hospital_infection"],
    isActive: true,
  },
  {
    id: "yangin-ilkyardim",
    name: "Yangın ve ilk yardım",
    renewal: { kind: "months", months: 36 },
    requiredFor: ["first_aid"],
    isActive: true,
  },
]

/** Hazır özlük belge kontrol listesi */
export const DEFAULT_DOCUMENT_TYPES: MockDocumentType[] = [
  {
    id: "kimlik",
    name: "Kimlik fotokopisi",
    required: true,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "ikametgah",
    name: "İkametgah belgesi",
    required: true,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "adli-sicil",
    name: "Adli sicil kaydı",
    required: true,
    validityMonths: 6,
    isActive: true,
  },
  {
    id: "diploma",
    name: "Diploma",
    required: false,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "sgk-giris",
    name: "SGK işe giriş bildirgesi",
    required: true,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "is-sozlesmesi",
    name: "İş sözleşmesi",
    required: true,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "kvkk-aydinlatma",
    name: "KVKK aydınlatma metni",
    required: true,
    validityMonths: null,
    isActive: true,
  },
  {
    id: "acik-riza",
    name: "Açık rıza beyanı",
    required: false,
    validityMonths: null,
    isActive: true,
  },
]

/** Sertifika tipi başına varsayılan geçerlilik (ay) */
export const DEFAULT_CERTIFICATE_VALIDITY: Partial<
  Record<CertificateType, number | null>
> = {
  hygiene: 12,
  hospital_infection: 12,
  food_handling: 12,
  work_at_height: 24,
  electrical: 60,
  first_aid: 36,
  security_id: 60,
  firearm: 60,
  airport_permit: 24,
}

/** Periyodik muayene sıklığı (yıl): İşyeri Hekimliği yönetmeliği */
export const HEALTH_EXAM_YEARS = { low: 5, dangerous: 3, very_dangerous: 1 }

export const VACCINE_TYPES = ["Hepatit B", "Tetanoz", "Grip"] as const
