import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { db } from "@/mocks/db"
import { resetFaker } from "@/mocks/factories/faker"
import { fakeTckn } from "@/mocks/factories/identity"
import { renderApp } from "@/test/render"

import { buildWorkbookFile } from "./lib/workbook"

const HEADERS = [
  "Sicil No",
  "T.C. Kimlik No",
  "Ad",
  "Soyad",
  "Cep Telefonu",
  "Pozisyon",
  "Hizmet Hattı",
  "İşveren VKN",
  "Lokasyon Kodu",
  "İşe Giriş Tarihi",
  "Yedek Havuzu",
]

function personnelFile(
  count: number,
  mutate?: (rows: (string | number | null)[][]) => void
) {
  const vkn = db.legalEntities.findFirst(
    (entity) => entity.tenantId === "temizlik-orta"
  )!.taxNumber
  const location = db.locations.findFirst(
    (item) => item.tenantId === "temizlik-orta"
  )!.code
  resetFaker(99)
  const rows: (string | number | null)[][] = Array.from(
    { length: count },
    (_, index) => [
      `X${String(index + 1).padStart(5, "0")}`,
      fakeTckn(),
      "Gül",
      "Şahin",
      "0533 444 55 66",
      "Temizlik personeli",
      "Temizlik",
      vkn,
      location,
      "01.10.2026",
      "Hayır",
    ]
  )
  mutate?.(rows)
  return buildWorkbookFile([HEADERS, ...rows], "personel.xlsx")
}

async function goToValidation(
  user: ReturnType<typeof renderApp>["user"],
  file: File
) {
  await user.click(await screen.findByRole("radio", { name: "Personel" }))
  await user.upload(await screen.findByLabelText("Excel dosyası yükle"), file)
  expect(await screen.findByText(/satır okundu/)).toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Devam" }))
  expect(
    await screen.findByRole("combobox", { name: "T.C. Kimlik No sütunu" })
  ).toHaveTextContent("T.C. Kimlik No")
  await user.click(screen.getByRole("button", { name: "Doğrula" }))
}

describe("Batch 1.7 Excel içe aktarma", () => {
  it("TC-1.7-01 100 satırda 3 hatalı satır: hatalar listelenir, 97 satır gönderilir", async () => {
    const file = personnelFile(100, (rows) => {
      rows[4]![1] = "11111111111"
      rows[19]![9] = ""
      rows[59]![5] = "Pilot"
    })
    const { user } = renderApp({ route: "/ice-aktar" })
    await goToValidation(user, file)
    expect(
      await screen.findByText("satır içe aktarılmaya hazır")
    ).toBeInTheDocument()
    const ready = screen.getByText(
      "satır içe aktarılmaya hazır"
    ).previousElementSibling
    expect(ready).toHaveTextContent("97")
    const errors = screen.getAllByTestId("import-error")
    expect(errors).toHaveLength(3)
    expect(errors[0]).toHaveTextContent(
      "6T.C. Kimlik NoGeçersiz T.C. Kimlik No"
    )
    expect(errors[1]).toHaveTextContent("21İşe Giriş TarihiZorunlu alan boş")
    expect(errors[2]).toHaveTextContent("61PozisyonGeçersiz değer")
    expect(
      screen.getByRole("button", { name: "Hata raporunu indir" })
    ).toBeInTheDocument()

    const before = db.personnel.count(
      (person) => person.tenantId === "temizlik-orta"
    )
    await user.click(
      screen.getByRole("button", { name: "97 satırı içe aktar" })
    )
    expect(
      await screen.findByText("İçe aktarma tamamlandı")
    ).toBeInTheDocument()
    expect(
      screen.getByText(/97 yeni, 0 güncellenen, 0 atlanan kayıt/)
    ).toBeInTheDocument()
    expect(
      db.personnel.count((person) => person.tenantId === "temizlik-orta")
    ).toBe(before + 97)
  })

  it("TC-1.7-02 sistemde kayıtlı TCKN: 'Mevcut kaydı güncelle / atla' seçimi sunulur", async () => {
    const existing = db.personnel.findFirst(
      (person) => person.tenantId === "temizlik-orta"
    )!
    const file = personnelFile(3, (rows) => {
      rows[0]![1] = existing.tckn
      rows[0]![0] = existing.employeeNumber
      rows[0]![3] = "Güncelsoyad"
    })
    const { user } = renderApp({ route: "/ice-aktar" })
    await goToValidation(user, file)
    expect(
      await screen.findByText("1 kayıt sistemde zaten var (T.C. Kimlik No)")
    ).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Atla" })).toBeChecked()
    await user.click(
      screen.getByRole("radio", { name: "Mevcut kaydı güncelle" })
    )
    await user.click(screen.getByRole("button", { name: "3 satırı içe aktar" }))
    expect(
      await screen.findByText(/2 yeni, 1 güncellenen, 0 atlanan kayıt/)
    ).toBeInTheDocument()
    expect(db.personnel.findById(existing.id)?.lastName).toBe("Güncelsoyad")
  })

  it("dosya içinde tekrar eden TCKN hata olarak işaretlenir", async () => {
    const file = personnelFile(3, (rows) => {
      rows[2]![1] = rows[0]![1] ?? null
    })
    const { user } = renderApp({ route: "/ice-aktar" })
    await goToValidation(user, file)
    const errors = await screen.findAllByTestId("import-error")
    expect(errors).toHaveLength(1)
    expect(errors[0]).toHaveTextContent(
      "Dosyada tekrar ediyor (satır 2 ile aynı T.C. Kimlik No)"
    )
  })

  it("zorunlu sütun eşleştirilmezse doğrulamaya geçilemez; sunucu reddi raporlanır", async () => {
    const file = personnelFile(2, (rows) => {
      rows[1]![8] = "YOK-00000"
    })
    const { user } = renderApp({ route: "/ice-aktar" })
    await user.click(await screen.findByRole("radio", { name: "Personel" }))
    await user.upload(await screen.findByLabelText("Excel dosyası yükle"), file)
    await user.click(await screen.findByRole("button", { name: "Devam" }))
    await user.click(await screen.findByRole("combobox", { name: "Ad sütunu" }))
    await user.click(
      await screen.findByRole("option", { name: "— Eşleştirme —" })
    )
    expect(
      await screen.findByText(/Zorunlu alanlar eşleştirilmedi: Ad/)
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Doğrula" })).toBeDisabled()

    await user.click(screen.getByRole("combobox", { name: "Ad sütunu" }))
    await user.click(await screen.findByRole("option", { name: "Ad" }))
    await user.click(screen.getByRole("button", { name: "Doğrula" }))
    await user.click(
      await screen.findByRole("button", { name: "2 satırı içe aktar" })
    )
    expect(
      await screen.findByText(/1 yeni.*1 satır sunucuda reddedildi/)
    ).toBeInTheDocument()
    const rejected = screen.getByRole("table", {
      name: "Sunucuda reddedilen satırlar",
    })
    expect(
      within(rejected).getByText("Lokasyon kodu bulunamadı")
    ).toBeInTheDocument()
  })

  it("yetki: yalnızca düzenleme yetkisi olan türler listelenir", async () => {
    renderApp({ user: "ik", route: "/ice-aktar" })
    expect(
      await screen.findByRole("radio", { name: "Personel" })
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.queryByRole("radio", { name: "Müşteri" })
      ).not.toBeInTheDocument()
    })
  })
})
