import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useForm } from "react-hook-form"
import { describe, expect, it } from "vitest"

import { ApiError, NetworkError } from "./errors"
import { applyApiErrorToForm } from "./form-errors"

interface Values {
  name: string
  score: number
}

function TestForm({ error }: { error: unknown }) {
  const form = useForm<Values>({ defaultValues: { name: "", score: 0 } })
  const { errors } = form.formState
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        applyApiErrorToForm(error, form.setError, ["name", "score"])
      }}
    >
      <label htmlFor="name">Ad</label>
      <input id="name" {...form.register("name")} />
      {errors.name ? <p role="alert">{errors.name.message}</p> : null}
      {errors.root?.server ? (
        <p role="status">{errors.root.server.message}</p>
      ) : null}
      <button type="submit">Kaydet</button>
    </form>
  )
}

async function submit(error: unknown) {
  render(<TestForm error={error} />)
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }))
}

describe("applyApiErrorToForm", () => {
  it("TC-0.3-04b 422 alan hatası ilgili input'a yazılır ve odaklanır", async () => {
    await submit(
      new ApiError(422, {
        code: "VALIDATION_FAILED",
        message: "Formda hatalı alanlar var.",
        fieldErrors: { name: ["Bu ad WLC-00003 kodlu kayıtta kullanılıyor."] },
      })
    )
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bu ad WLC-00003 kodlu kayıtta kullanılıyor."
    )
    expect(screen.getByLabelText("Ad")).toHaveFocus()
  })

  it("formda olmayan alan hataları genel hata olarak gösterilir", async () => {
    await submit(
      new ApiError(422, {
        code: "VALIDATION_FAILED",
        message: "Formda hatalı alanlar var.",
        fieldErrors: { contractId: ["Sözleşme kapalı"] },
      })
    )
    expect(screen.getByRole("status")).toHaveTextContent("Sözleşme kapalı")
  })

  it("422 dışındaki hatalar kullanıcı dostu genel mesaja dönüşür", async () => {
    await submit(new NetworkError("offline"))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin."
    )
  })
})
