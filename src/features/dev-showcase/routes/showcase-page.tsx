import { z } from "zod"

import { PageHeader } from "@/shared/components/page-header"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import {
  FilesTab,
  MapTab,
  StatesTab,
  TimeTab,
} from "../components/showcase-tabs"
import { ShowcaseTable } from "../components/showcase-table"

const SECTIONS = [
  { value: "tablo", label: "Veri tablosu" },
  { value: "zaman", label: "Zaman ve SLA" },
  { value: "harita", label: "Harita" },
  { value: "dosya", label: "Dosya" },
  { value: "durumlar", label: "Durum bileşenleri" },
] as const

type Section = (typeof SECTIONS)[number]["value"]

const sectionSchema = z.object({
  bolum: z
    .enum(SECTIONS.map((section) => section.value) as [Section, ...Section[]])
    .catch("tablo"),
})

export function ShowcasePage() {
  const [{ bolum }, setSection] = useSearchParamsState(sectionSchema)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bileşen vitrini"
        description="Faz 0 ortak bileşenlerinin mock API ile çalışan örnekleri. Yalnızca mock modunda görünür."
      />
      <Tabs
        value={bolum}
        onValueChange={(value) => {
          setSection({ bolum: value as Section })
        }}
      >
        <TabsList className="flex-wrap">
          {SECTIONS.map((section) => (
            <TabsTrigger key={section.value} value={section.value}>
              {section.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="tablo" className="pt-4">
          <ShowcaseTable />
        </TabsContent>
        <TabsContent value="zaman" className="pt-4">
          <TimeTab />
        </TabsContent>
        <TabsContent value="harita" className="pt-4">
          <MapTab />
        </TabsContent>
        <TabsContent value="dosya" className="pt-4">
          <FilesTab />
        </TabsContent>
        <TabsContent value="durumlar" className="pt-4">
          <StatesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
