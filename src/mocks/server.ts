import { setupServer } from "msw/node"

import { handlers } from "./handlers"

/** Vitest (Node) ortamı için MSW sunucusu. Yaşam döngüsü `src/test/setup.ts` içinde. */
export const server = setupServer(...handlers)
