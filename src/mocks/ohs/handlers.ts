import { healthHandlers } from "./health-handlers"
import { ohsHandlers } from "./ohs-handlers"
import { personnelFileHandlers } from "./personnel-file-handlers"

/** Faz 6: İSG eğitimleri, sertifikalar, sağlık gözetimi, özlük ve denetim paketi */
export const ohsMockHandlers = [
  ...ohsHandlers,
  ...healthHandlers,
  ...personnelFileHandlers,
]
