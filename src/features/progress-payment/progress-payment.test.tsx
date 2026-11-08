import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { mockClock } from "@/mocks/clock"
import { workedSource } from "@/mocks/contracts/contracts"
import { db } from "@/mocks/db"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderApp } from "@/test/render"
import { applyTestScenario } from "@/test/scenario"

import { sourceFingerprint } from "./domain/calculate"

const TENANT = "temizlik-orta"
const FIRST = `ct-${TENANT}-1`
const OCTOBER = "2026-10-05T10:00:00+03:00"

function insertPayment(
  status: "draft" | "customer_approval",
  contractId = FIRST,
  month = "2026-07"
) {
  const source = workedSource(
    db.contracts.findById(contractId)!,
    month,
    mockClock.now()
  )
  return db.progressPayments.insert({
    id: `pp-test-${status}`,
    tenantId: TENANT,
    number: `HK-TEST-${status}`,
    contractId,
    month,
    status,
    penalties: [],
    source,
    fingerprint: sourceFingerprint(source),
    calculatedAt: OCTOBER,
    invoiceNumber: null,
    history: [
      { at: OCTOBER, actor: "Test", action: "Taslak oluşturuldu", note: null },
    ],
    updatedAt: OCTOBER,
  })
}

describe("Batch 3.3 hakediş", () => {
  it("taslak → kontrol → müşteri adına onay (gerekçe zorunlu) → faturalandı; a11y", async () => {
    mockClock.freeze(OCTOBER)
    const contract = db.contracts.findById(FIRST)!
    const { user, container } = renderApp({ route: "/hakedis", user: "finans" })
    await user.click(
      await screen.findByRole("button", { name: "Yeni hakediş" })
    )
    const dialog = await screen.findByRole("dialog", { name: "Yeni hakediş" })
    await user.click(within(dialog).getByRole("combobox", { name: "Sözleşme" }))
    await user.click(
      await screen.findByRole("option", { name: new RegExp(contract.code) })
    )
    await user.click(within(dialog).getByRole("combobox", { name: "Dönem" }))
    await user.click(await screen.findByRole("option", { name: "Temmuz 2026" }))
    await user.click(
      within(dialog).getByRole("button", { name: "Taslak oluştur" })
    )

    expect(
      await screen.findByRole("heading", { name: /^Hakediş HK-202607/ })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("table", { name: "Hakediş kalemleri" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("payment-total")).toHaveTextContent("₺")
    await expectNoA11yViolations(container)

    const act = async (name: string) => {
      await user.click(await screen.findByRole("button", { name }))
      const step = await screen.findByRole("dialog", { name })
      return step
    }
    let step = await act("Kontrole gönder")
    await user.click(within(step).getByRole("button", { name: "Onayla" }))
    step = await act("Kontrol onayı ver, müşteriye gönder")
    await user.click(within(step).getByRole("button", { name: "Onayla" }))
    step = await act("Müşteri adına onayla")
    await user.click(within(step).getByRole("button", { name: "Onayla" }))
    expect(await within(step).findByText("Gerekçe zorunlu")).toBeInTheDocument()
    await user.type(
      within(step).getByLabelText("Gerekçe"),
      "Müşteri e-postayla onayladı"
    )
    await user.click(within(step).getByRole("button", { name: "Onayla" }))
    step = await act("Faturalandı olarak işaretle")
    await user.type(
      within(step).getByLabelText("Fatura numarası"),
      "PNT2026000777"
    )
    await user.click(within(step).getByRole("button", { name: "Onayla" }))
    const steps = await screen.findByRole("list", { name: "Hakediş adımları" })
    await waitFor(() => {
      expect(
        within(steps).getByText("Faturalandı").closest("li")
      ).toHaveAttribute("aria-current", "step")
    })
    expect(
      screen.getByRole("list", { name: "Hakediş geçmişi" })
    ).toHaveTextContent("Müşteri e-postayla onayladı")
    expect(
      screen.queryByRole("button", { name: "Ceza ekle" })
    ).not.toBeInTheDocument()
  })

  it("ceza ekleme toplamı düşürür", async () => {
    mockClock.freeze(OCTOBER)
    insertPayment("draft")
    const { user } = renderApp({
      route: "/hakedis/pp-test-draft",
      user: "finans",
    })
    const total = await screen.findByTestId("payment-total")
    const before = total.textContent
    await user.click(await screen.findByRole("button", { name: "Ceza ekle" }))
    const dialog = await screen.findByRole("dialog", { name: "Ceza ekle" })
    await user.click(within(dialog).getByRole("button", { name: "Ekle" }))
    expect(
      await screen.findByRole("list", { name: "Ceza kalemleri" })
    ).toHaveTextContent("× 1")
    await waitFor(() => {
      expect(screen.getByTestId("payment-total").textContent).not.toBe(before)
    })
  })

  it("TC-3.3-04 bölge sorumlusu hakedişi görür; onay ve yeniden hesap butonu yok", async () => {
    mockClock.freeze(OCTOBER)
    insertPayment("draft")
    renderApp({ route: "/hakedis/pp-test-draft", user: "bolge" })
    expect(
      await screen.findByRole("heading", { name: "Hakediş HK-TEST-draft" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kontrole gönder" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Yeniden hesapla" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Yeni hakediş" })
    ).not.toBeInTheDocument()
  })

  it("TC-3.3-05 taslak sonrası puantaj değişikliği: 'Güncel değil' + fark tablosu; yeniden hesap uyarıyı kaldırır", async () => {
    applyTestScenario("stale-progress-payment")
    mockClock.freeze(OCTOBER)
    const { user } = renderApp({ route: "/hakedis", user: "finans" })
    const table = await screen.findByRole("table", { name: "Hakedişler" })
    expect(await within(table).findByText("Güncel değil")).toBeInTheDocument()
    await user.click(within(table).getByRole("link", { name: /HK-202609-002/ }))
    await user.click(
      await screen.findByRole("button", { name: "Farkı göster" })
    )
    expect(screen.getByText("Güncel değil")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Kontrole gönder" })
    ).not.toBeInTheDocument()
    const diff = await screen.findByRole("table", { name: "Fark tablosu" })
    expect(diff).toHaveTextContent("Genel toplam (KDV dahil)")
    expect(diff).toHaveTextContent("eksik kişi-gün")
    await user.click(screen.getByRole("button", { name: "Yeniden hesapla" }))
    await waitFor(() => {
      expect(screen.queryByText("Güncel değil")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Puantaj onaylanmadı")).toBeInTheDocument()
  })

  it("müşteri portalı: onaydaki hakedişi müşteri onaylar", async () => {
    mockClock.freeze(OCTOBER)
    const customerId = (
      db.users.findById(`u-${TENANT}-musteri`)!.scope as { ids: string[] }
    ).ids[0]!
    const contract = db.contracts.findFirst(
      (item) => item.tenantId === TENANT && item.customerId === customerId
    )!
    insertPayment("customer_approval", contract.id)
    const { user, container } = renderApp({
      route: "/portal/hakedisler",
      user: "musteri",
    })
    await user.click(
      await screen.findByRole("button", { name: "Hakedişi onayla" })
    )
    const list = screen.getByRole("list", { name: "Hakedişler" })
    expect(await within(list).findByText("Onaylandı")).toBeInTheDocument()
    await expectNoA11yViolations(container)
  })
})
