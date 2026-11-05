import { describe, expect, it } from "vitest"

import { useUiStore } from "@/shared/stores/ui-store"

import { brand, storageKey } from "./brand"

describe("Ürün markası", () => {
  it("TC-0.7-01 depolama anahtarları puantio önekiyle üretilir", () => {
    expect(storageKey("ui")).toBe("puantio.ui")
    expect(storageKey("theme")).toBe("puantio.theme")
  })

  it("TC-0.7-02 kalıcı UI tercihleri puantio anahtarına yazılır, eski wilco anahtarı kullanılmaz", () => {
    useUiStore.getState().setSidebarOpen(false)
    expect(localStorage.getItem("puantio.ui")).toContain('"sidebarOpen":false')
    expect(localStorage.getItem("wilco.ui")).toBeNull()
    expect(brand.productName).toBe("Puantio")
  })
})
