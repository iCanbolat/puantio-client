import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { db } from "@/mocks/db"
import { server } from "@/mocks/server"
import { compareTr } from "@/shared/lib/format"
import { useUiStore } from "@/shared/stores/ui-store"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

const ROUTE = "/gelistirici/bilesenler"

/** Tablodaki veri satırları (başlık hariç) */
async function bodyRows() {
  const table = await screen.findByRole("table", { name: "Vitrin kayıtları" })
  await waitFor(() => {
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1)
  })
  return within(table).getAllByRole("row").slice(1)
}

const codesOf = (rows: HTMLElement[]) =>
  rows.map((row) => within(row).getAllByRole("cell")[1]?.textContent)

describe("DataTable (vitrin ekranı üzerinden)", () => {
  it("TC-0.6-01 sayfa ve sıralama URL'ye yazılır, yeniden açılışta korunur", async () => {
    const { user, router, unmount } = renderApp({ route: ROUTE })
    expect(await bodyRows()).toHaveLength(20)
    expect(screen.getByText("Sayfa 1 / 3")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Sonraki sayfa" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("?page=2")
    })
    await user.click(screen.getByRole("button", { name: "Ad: artan sırala" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("?sort=name&order=asc")
    })
    await user.click(screen.getByRole("button", { name: "Sonraki sayfa" }))
    await waitFor(() => {
      expect(
        Object.fromEntries(new URLSearchParams(router.state.location.search))
      ).toEqual({
        sort: "name",
        order: "asc",
        page: "2",
      })
    })
    await waitFor(() => {
      expect(screen.getByText("Sayfa 2 / 3")).toBeInTheDocument()
    })
    const url = `${router.state.location.pathname}${router.state.location.search}`
    const firstRowOnPage2 = codesOf(await bodyRows())[0]
    unmount()

    // "Sayfa yenileme": aynı URL ile yeni uygulama örneği
    renderApp({ route: url })
    await waitFor(() => {
      expect(screen.getByText("Sayfa 2 / 3")).toBeInTheDocument()
    })
    expect(codesOf(await bodyRows())[0]).toBe(firstRowOnPage2)
    expect(screen.getByRole("columnheader", { name: /^Ad/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )

    const expected = db.showcaseRecords
      .findMany()
      .sort((a, b) => compareTr(a.name, b.name))
      .slice(20, 40)
      .map((record) => record.code)
    expect(codesOf(await bodyRows())).toEqual(expected)
  })

  it("TC-0.6-01b hızlı çift tıklama iki sayfa ilerletir, filtreler korunur", async () => {
    const { user, router } = renderApp({
      route: `${ROUTE}?sort=name&order=asc`,
    })
    await bodyRows()
    const next = screen.getByRole("button", { name: "Sonraki sayfa" })
    await user.dblClick(next)
    await waitFor(() => {
      expect(
        Object.fromEntries(new URLSearchParams(router.state.location.search))
      ).toEqual({
        sort: "name",
        order: "asc",
        page: "3",
      })
    })
    await waitFor(() => {
      expect(screen.getByText("Sayfa 3 / 3")).toBeInTheDocument()
    })
  })

  it("TC-0.6-18 ilk/son/önceki sayfa ve sayfa boyutu", async () => {
    const { user, router } = renderApp({ route: ROUTE })
    await bodyRows()
    await user.click(screen.getByRole("button", { name: "Son sayfa" }))
    await waitFor(async () => {
      expect(await bodyRows()).toHaveLength(5)
    })
    expect(screen.getByText("Sayfa 3 / 3")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sonraki sayfa" })).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "Önceki sayfa" }))
    await waitFor(() => {
      expect(screen.getByText("Sayfa 2 / 3")).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: "İlk sayfa" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("")
    })

    await user.click(screen.getByRole("combobox", { name: "Sayfa başına" }))
    await user.click(await screen.findByRole("option", { name: "50" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("?pageSize=50")
    })
    await waitFor(async () => {
      expect(await bodyRows()).toHaveLength(45)
    })
    expect(screen.getByText("Sayfa 1 / 1")).toBeInTheDocument()
  })

  it("TC-0.6-02 sunucu hatasında tablo içinde hata ve 'Tekrar dene' gösterilir", async () => {
    applyTestScenario("server-error")
    const { user } = renderApp({ route: ROUTE })
    expect(await screen.findByText("Veriler yüklenemedi")).toBeInTheDocument()
    expect(
      screen.getByText("Sunucuda bir hata oluştu. Lütfen tekrar deneyin.")
    ).toBeInTheDocument()

    server.resetHandlers() // sunucu düzeldi
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }))
    expect(await bodyRows()).toHaveLength(20)
  })

  it("TC-0.6-06 boş veri ve kontrat hatası durumları", async () => {
    applyTestScenario("empty")
    const empty = renderApp({ route: ROUTE })
    expect(await screen.findByText("Kayıt bulunamadı")).toBeInTheDocument()
    empty.unmount()

    applyTestScenario("contract-drift")
    renderApp({ route: ROUTE })
    expect(
      await screen.findByText(
        "Sunucudan beklenmeyen bir yanıt alındı. Teknik ekip bilgilendirildi."
      )
    ).toBeInTheDocument()
  })

  it("TC-0.6-07 arama ve filtre URL'ye yazılır, 'Filtreleri temizle' sıfırlar", async () => {
    const { user, router } = renderApp({ route: ROUTE })
    await bodyRows()
    await user.type(
      screen.getByRole("searchbox", { name: "Kayıtlarda ara" }),
      "WLC-00012"
    )
    await waitFor(() => {
      expect(router.state.location.search).toBe("?q=WLC-00012")
    })
    await waitFor(async () => {
      expect(codesOf(await bodyRows())).toEqual(["WLC-00012"])
    })

    await user.click(screen.getByRole("button", { name: "Filtreleri temizle" }))
    await waitFor(() => {
      expect(router.state.location.search).toBe("")
    })
    expect(
      screen.getByRole("searchbox", { name: "Kayıtlarda ara" })
    ).toHaveValue("")
  })

  it("TC-0.6-08 kolon gizleme kullanıcı tercihi olarak saklanır", async () => {
    const { user } = renderApp({ route: ROUTE })
    await bodyRows()
    expect(
      screen.getByRole("columnheader", { name: /Şehir/ })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Kolonlar" }))
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Şehir" })
    )
    await waitFor(() => {
      expect(
        screen.queryByRole("columnheader", { name: /Şehir/ })
      ).not.toBeInTheDocument()
    })
    expect(useUiStore.getState().hiddenColumns["vitrin-kayitlari"]).toEqual([
      "city",
    ])
  })

  it("TC-0.6-09 satır seçimi ve onaylı toplu silme", async () => {
    const { user } = renderApp({ route: ROUTE })
    const rows = await bodyRows()
    const before = db.showcaseRecords.count()

    await user.click(
      within(rows[0]!).getByRole("checkbox", { name: "Satırı seç" })
    )
    await user.click(
      within(rows[1]!).getByRole("checkbox", { name: "Satırı seç" })
    )
    expect(screen.getByText(/2 seçili/)).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "Seçilenleri sil (2)" })
    )
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText("2 kayıt silinsin mi?")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Sil" }))

    await waitFor(() => {
      expect(db.showcaseRecords.count()).toBe(before - 2)
    })
    expect(
      await screen.findByText("Seçilen kayıtlar silindi")
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/^Toplam/)).toHaveTextContent(
        `Toplam ${before - 2} kayıt`
      )
    })
  })

  it("TC-0.6-10 görünümdeki satırlar CSV olarak indirilir", async () => {
    let captured: Blob | null = null
    const createObjectURL = vi.fn((blob: Blob) => {
      captured = blob
      return "blob:csv"
    })
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    )
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined
    )

    const { user } = renderApp({ route: `${ROUTE}?pageSize=10` })
    await bodyRows()
    await user.click(screen.getByRole("button", { name: "CSV" }))

    expect(captured).not.toBeNull()
    const text = await (captured as unknown as Blob).text()
    const lines = text.replace(/^\uFEFF/, "").split("\r\n")
    expect(lines[0]).toBe(
      "Kod;Ad;Şehir;Durum;Puan;Kadro;Aylık tutar;Güncelleme"
    )
    expect(lines).toHaveLength(11)
    expect(lines[1]).toMatch(/^WLC-00001;/)
  })

  it("TC-0.6-11 tablo ekranı erişilebilirlik denetiminden geçer", async () => {
    const { container } = renderApp({ route: ROUTE })
    await bodyRows()
    await expectNoA11yViolations(container)
  })
})
