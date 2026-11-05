import "./index.css"

import { StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "@/app/app"
import { createAppContext, type AppContextOptions } from "@/app/app-context"

/**
 * Mock modu: `VITE_API_MOCKING=true` iken MSW worker'ı, dev paneli ve yönlendirmesiz kimlik
 * adaptörü yüklenir. Koşul derleme zamanında sabitlendiği için üretim paketine mock kodu girmez.
 */
async function prepareMocking(): Promise<{
  devtools: ReactNode
  options: AppContextOptions
}> {
  if (import.meta.env.VITE_API_MOCKING !== "true")
    return { devtools: null, options: {} }
  const [{ startMocking, mockAppOptions }, { MockDevtools }] =
    await Promise.all([
      import("./mocks/browser"),
      import("./mocks/devtools/mock-devtools"),
    ])
  await startMocking()
  return { devtools: <MockDevtools />, options: mockAppOptions() }
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("#root bulunamadı")

void prepareMocking().then(({ devtools, options }) => {
  const context = createAppContext(options)
  createRoot(rootElement).render(
    <StrictMode>
      <App context={context} devtools={devtools} />
    </StrictMode>
  )
})
