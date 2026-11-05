import axe from "axe-core"
import { expect } from "vitest"

/**
 * axe-core ile erişilebilirlik denetimi. jsdom yerleşim hesaplamadığı için renk kontrastı
 * kuralı kapalıdır (E2E'de gerçek tarayıcıda denetlenir).
 */
export async function expectNoA11yViolations(
  container: Element
): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: false },
    },
  })
  const violations = results.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact ?? "?"}): ${violation.help} → ${violation.nodes
        .map((node) => node.html.slice(0, 160))
        .join(" | ")}`
  )
  expect(violations).toEqual([])
}
