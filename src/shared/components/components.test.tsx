import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { mockClock } from "@/mocks/clock"
import { syncServerTime } from "@/shared/lib/server-time"
import { Button } from "@/shared/ui/button"
import { expectNoA11yViolations } from "@/test/a11y"
import { renderWithProviders } from "@/test/render"

import { AsyncCombobox, type AsyncComboboxOption } from "./async-combobox"
import { ConfirmDialog } from "./confirm-dialog"
import { DateRangePicker } from "./date-range-picker"
import { FileDropzone } from "./file-dropzone"
import { FilterBar } from "./filter-bar"
import { GeofenceRadiusControl } from "./map-picker/geofence-radius-control"
import { SlaCountdown } from "./sla-countdown"

afterEach(() => {
  vi.useRealTimers()
})

const CITIES: AsyncComboboxOption[] = [
  "İstanbul",
  "İzmir",
  "Isparta",
  "Ankara",
].map((city) => ({
  value: city,
  label: city,
}))

describe("AsyncCombobox", () => {
  it("TC-0.6-03 hızlı yazımda yalnızca son değer için tek istek atılır", async () => {
    const fetchOptions = vi.fn((query: string) =>
      Promise.resolve(
        CITIES.filter((city) =>
          city.label
            .toLocaleLowerCase("tr")
            .includes(query.toLocaleLowerCase("tr"))
        )
      )
    )
    const onValueChange = vi.fn()
    const { user } = renderWithProviders(
      <AsyncCombobox
        aria-label="Şehir"
        queryKey={["sehirler"]}
        fetchOptions={fetchOptions}
        value={null}
        onValueChange={onValueChange}
      />
    )
    const input = screen.getByRole("combobox", { name: "Şehir" })
    await user.click(input)
    await user.type(input, "İz")
    await waitFor(() => {
      expect(fetchOptions).toHaveBeenCalledWith("İz", expect.any(AbortSignal))
    })
    await waitFor(() => {
      expect(screen.getAllByRole("option")).toHaveLength(1)
    })

    const queries = fetchOptions.mock.calls.map(([query]) => query)
    expect(queries).not.toContain("İ")
    expect(queries.filter((query) => query === "İz")).toHaveLength(1)

    await user.click(screen.getByRole("option", { name: "İzmir" }))
    expect(onValueChange).toHaveBeenCalledWith("İzmir", {
      value: "İzmir",
      label: "İzmir",
    })
  })

  it("minimum karakter sınırı ve seçili etiket", async () => {
    const fetchOptions = vi.fn(() => Promise.resolve(CITIES))
    const { user } = renderWithProviders(
      <AsyncCombobox
        aria-label="Lokasyon"
        queryKey={["lokasyon"]}
        fetchOptions={fetchOptions}
        value="L-1"
        selectedLabel="Kadıköy Şubesi"
        minQueryLength={3}
        onValueChange={() => undefined}
      />
    )
    const input = screen.getByRole("combobox", { name: "Lokasyon" })
    expect(input).toHaveValue("Kadıköy Şubesi")
    await user.clear(input)
    await user.type(input, "an")
    expect(
      await screen.findByText("En az 3 karakter yazın")
    ).toBeInTheDocument()
    expect(fetchOptions).not.toHaveBeenCalled()
  })
})

describe("FilterBar", () => {
  it("TC-0.6-12 arama gecikmeli tek çağrı üretir, temizle sıfırlar", async () => {
    const onSearchChange = vi.fn()
    const onReset = vi.fn()
    function Harness() {
      const [search, setSearch] = useState<string | undefined>()
      return (
        <FilterBar
          search={search}
          onSearchChange={(value) => {
            onSearchChange(value)
            setSearch(value)
          }}
          onReset={() => {
            onReset()
            setSearch(undefined)
          }}
          searchLabel="Personel ara"
        />
      )
    }
    const { user } = renderWithProviders(<Harness />)
    await user.type(
      screen.getByRole("searchbox", { name: "Personel ara" }),
      "Ayşe"
    )
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith("Ayşe")
    })
    expect(onSearchChange).toHaveBeenCalledOnce()

    await user.click(screen.getByRole("button", { name: "Filtreleri temizle" }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole("searchbox", { name: "Personel ara" })).toHaveValue(
      ""
    )
    expect(
      screen.queryByRole("button", { name: "Filtreleri temizle" })
    ).not.toBeInTheDocument()
  })
})

describe("ConfirmDialog", () => {
  function renderDialog(onConfirm: () => Promise<unknown>) {
    return renderWithProviders(
      <ConfirmDialog
        trigger={<Button>Sil</Button>}
        title="Kayıt silinsin mi?"
        description="Bu işlem geri alınamaz."
        confirmLabel="Evet, sil"
        destructive
        onConfirm={onConfirm}
      />
    )
  }

  it("TC-0.6-13 onaylanınca işlem bitene kadar bekler ve kapanır", async () => {
    let resolve: () => void = () => undefined
    const onConfirm = vi.fn(() => new Promise<void>((done) => (resolve = done)))
    const { user } = renderDialog(onConfirm)

    await user.click(screen.getByRole("button", { name: "Sil" }))
    const dialog = await screen.findByRole("alertdialog", {
      name: "Kayıt silinsin mi?",
    })
    await user.click(within(dialog).getByRole("button", { name: "Evet, sil" }))
    expect(onConfirm).toHaveBeenCalledOnce()
    // Bekleme sırasında buton döner ikon (Yükleniyor) içerir
    expect(
      within(dialog).getByRole("button", { name: /Evet, sil/ })
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("status", { name: "Yükleniyor" })
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "Vazgeç" })
    ).toBeDisabled()

    act(() => {
      resolve()
    })
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    })
  })

  it("işlem başarısızsa diyalog açık kalır", async () => {
    const { user } = renderDialog(() => Promise.reject(new Error("409")))
    await user.click(screen.getByRole("button", { name: "Sil" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Evet, sil" }))
    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Evet, sil" })
      ).toBeEnabled()
    })
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })
})

describe("SlaCountdown", () => {
  it("TC-0.6-14 sunucu saatine göre sayar; 5 dk altında uyarı, süre dolunca aşıldı", () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T04:00:00Z") })
    // Tarayıcı saati 07:00, sunucu saati 07:10 (İstanbul) → offset +10 dk
    mockClock.freeze("2026-09-29T04:10:00Z")
    syncServerTime("2026-09-29T04:10:00Z")
    renderWithProviders(<SlaCountdown dueAt="2026-09-29T04:25:00Z" />)

    const timer = screen.getByRole("timer")
    expect(timer).toHaveTextContent("15:00")
    expect(timer).toHaveAttribute("data-state", "ok")

    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 1000)
    })
    expect(timer).toHaveTextContent("04:59")
    expect(timer).toHaveAttribute("data-state", "warning")

    act(() => {
      vi.advanceTimersByTime(7 * 60_000)
    })
    expect(timer).toHaveAttribute("data-state", "breached")
    expect(timer).toHaveTextContent("Aşıldı -02:01")
    expect(timer).toHaveAccessibleName("SLA 02:01 aşıldı")
  })
})

describe("FileDropzone", () => {
  it("TC-0.6-15 uygun dosyaları listeler, uygunsuzları gerekçesiyle reddeder", async () => {
    function Harness() {
      const [files, setFiles] = useState<File[]>([])
      return (
        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept=".xlsx,.csv"
          maxSizeBytes={1024}
          multiple
          label="Excel dosyası yükle"
        />
      )
    }
    renderWithProviders(<Harness />)
    // Sürükle-bırak `accept` filtresini atlar; bileşenin kendi doğrulaması test edilir
    const user = userEvent.setup({ applyAccept: false })
    const input = screen.getByLabelText("Excel dosyası yükle")
    await user.upload(input, [
      new File(["a"], "personel.xlsx"),
      new File(["b"], "rapor.pdf", { type: "application/pdf" }),
      new File([new Uint8Array(4096)], "büyük.csv"),
    ])

    const list = screen.getByRole("list", { name: "Seçilen dosyalar" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)
    expect(within(list).getByText("personel.xlsx")).toBeInTheDocument()
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("rapor.pdf: Desteklenmeyen dosya türü")
    expect(alert).toHaveTextContent("büyük.csv: Dosya 1 KB sınırını aşıyor")

    await user.click(
      screen.getByRole("button", { name: "personel.xlsx dosyasını kaldır" })
    )
    expect(
      screen.queryByRole("list", { name: "Seçilen dosyalar" })
    ).not.toBeInTheDocument()
  })
})

describe("FileDropzone sürükle-bırak", () => {
  it("bırakılan dosyalar doğrulanır; tekli modda son dosya kalır", () => {
    const onFilesChange = vi.fn()
    renderWithProviders(
      <FileDropzone
        files={[]}
        onFilesChange={onFilesChange}
        accept=".csv"
        label="CSV yükle"
      />
    )
    const zone = screen
      .getByText("CSV yükle")
      .closest("[data-dragging], div.border-dashed")!
    const files = [new File(["a"], "a.csv"), new File(["b"], "b.csv")]
    fireEvent.dragOver(zone, { dataTransfer: { files } })
    expect(zone).toHaveAttribute("data-dragging", "true")
    fireEvent.drop(zone, { dataTransfer: { files } })
    expect(onFilesChange).toHaveBeenCalledWith([files[0]])
    expect(zone).not.toHaveAttribute("data-dragging")
  })
})

describe("GeofenceRadiusControl", () => {
  it("TC-1.5-01 (ön koşul) sınır dışı yarıçap odaktan çıkınca sınıra çekilir", async () => {
    const onChange = vi.fn()
    function Harness() {
      const [radius, setRadius] = useState(100)
      return (
        <GeofenceRadiusControl
          value={radius}
          onChange={(next) => {
            onChange(next)
            setRadius(next)
          }}
        />
      )
    }
    const { user } = renderWithProviders(<Harness />)
    const input = screen.getByLabelText("Geofence yarıçapı (metre)")
    await user.clear(input)
    await user.type(input, "5000")
    await user.tab()
    expect(input).toHaveValue(1000)
    expect(onChange).toHaveBeenLastCalledWith(1000)
  })
})

describe("DateRangePicker", () => {
  it("TC-0.6-16 ön tanımlı aralıklar İstanbul'daki bugüne göre hesaplanır", async () => {
    // İstanbul: 26 Eylül 00:30 (canlı kanal selamı da aynı saati bildirsin)
    mockClock.freeze("2026-09-25T21:30:00Z")
    syncServerTime("2026-09-25T21:30:00Z")
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <DateRangePicker
        value={{}}
        onChange={onChange}
        label="Güncelleme tarihi"
      />
    )
    await user.click(screen.getByRole("button", { name: "Güncelleme tarihi" }))
    await user.click(await screen.findByRole("button", { name: "Son 7 gün" }))
    expect(onChange).toHaveBeenCalledWith({
      from: "2026-09-20",
      to: "2026-09-26",
    })
  })

  it("seçili aralık gösterilir ve temizlenebilir", async () => {
    const onChange = vi.fn()
    const { user, container } = renderWithProviders(
      <DateRangePicker
        value={{ from: "2026-09-01", to: "2026-09-25" }}
        onChange={onChange}
        label="Tarih"
      />
    )
    expect(
      screen.getByRole("button", { name: "Tarih: 01.09.2026 – 25.09.2026" })
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: "Tarih filtresini temizle" })
    )
    expect(onChange).toHaveBeenCalledWith({})
    await expectNoA11yViolations(container)
  })
})
