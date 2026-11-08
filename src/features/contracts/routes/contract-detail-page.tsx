import { useQuery } from "@tanstack/react-query"
import { FilePlus2Icon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"
import { z } from "zod"

import { CONTRACT_TYPE_LABELS, ContractStatusBadge } from "@/entities/contract"
import { POSITION_LABELS } from "@/entities/personnel"
import { Can } from "@/entities/session"
import { SERVICE_LINE_LABELS } from "@/entities/tenant"
import { DetailList } from "@/shared/components/detail-list"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { SimpleSelect } from "@/shared/components/simple-select"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { toIsoDate } from "@/shared/lib/date"
import { formatDate, formatMoney } from "@/shared/lib/format"
import { serverNow } from "@/shared/lib/server-time"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { contractDetailQueries } from "../api/contracts-api"
import { AddendumDialog } from "../components/addendum-dialog"
import { VersionCompare } from "../components/version-compare"
import { totalHeadcount } from "../domain/commitments"
import { versionAt, versionLabel } from "../domain/versions"
import {
  COVERAGE_LABELS,
  PRICE_ADJUSTMENT_LABELS,
  latestVersion,
  type ContractVersion,
} from "../model/contract"

const TABS = [
  "genel",
  "kapsam",
  "kadro",
  "fiyatlar",
  "kurallar",
  "surumler",
] as const
const tabSchema = z.object({
  sekme: z.enum(TABS).catch("genel"),
  surum: z.string().min(1).optional().catch(undefined),
})

export function ContractDetailPage() {
  const { contractId = "" } = useParams()
  const query = useQuery(contractDetailQueries.detail(contractId))
  const [{ sekme, surum }, setParams] = useSearchParamsState(tabSchema)
  const [addendum, setAddendum] = useState(false)

  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const contract = query.data
  const today = toIsoDate(serverNow())
  const current =
    versionAt(contract.versions, today) ?? latestVersion(contract.versions)
  const version: ContractVersion =
    contract.versions.find((item) => item.id === surum) ?? current

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={contract.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{contract.code}</span>·
            <span>{contract.customerName}</span>
            <ContractStatusBadge status={contract.status} />
          </span>
        }
        actions={
          <>
            <Link
              to={paths.contracts.headcount({ contractId: contract.id })}
              className={buttonVariants({ variant: "outline" })}
            >
              Kadro raporu
            </Link>
            <Link
              to={paths.progressPayments.list({ contractId: contract.id })}
              className={buttonVariants({ variant: "outline" })}
            >
              Hakedişler
            </Link>
            <Can permission="contract:write">
              <Button
                onClick={() => {
                  setAddendum(true)
                }}
              >
                <FilePlus2Icon data-icon="inline-start" />
                Zeyilname ekle
              </Button>
            </Can>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="contract-version" className="text-sm font-medium">
          Görüntülenen sürüm
        </label>
        <SimpleSelect
          id="contract-version"
          className="sm:w-80"
          value={version.id}
          options={contract.versions.map((item) => ({
            value: item.id,
            label: `${versionLabel(item.number)} · ${formatDate(item.effectiveFrom)} – ${formatDate(item.effectiveTo)}${item.id === current.id ? " (yürürlükte)" : ""}`,
          }))}
          onChange={(id) => {
            setParams({ surum: id === current.id ? undefined : id })
          }}
        />
      </div>
      <Tabs
        value={sekme}
        onValueChange={(value) => {
          setParams({ sekme: value as (typeof TABS)[number] })
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="genel">Genel</TabsTrigger>
          <TabsTrigger value="kapsam">Kapsam ve lokasyonlar</TabsTrigger>
          <TabsTrigger value="kadro">Taahhüt kadro</TabsTrigger>
          <TabsTrigger value="fiyatlar">Birim fiyatlar</TabsTrigger>
          <TabsTrigger value="kurallar">Kurallar</TabsTrigger>
          <TabsTrigger value="surumler">
            Sürümler ({contract.versions.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="genel">
          <Card>
            <CardContent>
              <DetailList
                items={[
                  { label: "Müşteri", value: contract.customerName },
                  {
                    label: "Yüklenici tüzel kişilik",
                    value: contract.contractorTitle,
                  },
                  { label: "Tip", value: CONTRACT_TYPE_LABELS[contract.type] },
                  { label: "İKN", value: contract.ikn },
                  {
                    label: "Sözleşme süresi",
                    value: `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`,
                  },
                  {
                    label: "Hizmet hatları",
                    value: version.serviceLines
                      .map((line) => SERVICE_LINE_LABELS[line])
                      .join(", "),
                  },
                  {
                    label: "Kapsamdaki lokasyon",
                    value: `${version.locations.length}`,
                  },
                  {
                    label: "Taahhüt kadro",
                    value: `${totalHeadcount(version.commitments)} kişi`,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="kapsam" className="flex flex-col gap-4">
          {version.scopeItems.length > 0 ? (
            <ul className="list-disc pl-5 text-sm">
              {version.scopeItems.map((item, index) => (
                <li key={index}>
                  <strong>{SERVICE_LINE_LABELS[item.serviceLine]}:</strong>{" "}
                  {item.description}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="rounded-lg border">
            <Table>
              <caption className="sr-only">Kapsamdaki lokasyonlar</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Lokasyon</TableHead>
                  <TableHead>Bölge</TableHead>
                  <TableHead>Kapsama giriş</TableHead>
                  <TableHead>Kapsamdan çıkış</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {version.locations.map((location) => (
                  <TableRow key={location.locationId}>
                    <TableCell>
                      <Link
                        to={paths.locations.detail(location.locationId)}
                        className="hover:underline"
                      >
                        {location.locationName}
                      </Link>
                    </TableCell>
                    <TableCell>{location.orgUnitName}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(location.from)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {location.to ? formatDate(location.to) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="kadro">
          <div className="rounded-lg border">
            <Table scrollLabel="Taahhüt kadro tablosu">
              <caption className="sr-only">Taahhüt kadro</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Lokasyon</TableHead>
                  <TableHead>Pozisyon</TableHead>
                  <TableHead>Vardiya kapsamı</TableHead>
                  <TableHead className="text-right">Kadro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {version.commitments.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {version.locations.find(
                        (location) => location.locationId === item.locationId
                      )?.locationName ?? item.locationId}
                    </TableCell>
                    <TableCell>{POSITION_LABELS[item.position]}</TableCell>
                    <TableCell>{COVERAGE_LABELS[item.coverage]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.headcount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Toplam</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalHeadcount(version.commitments)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="fiyatlar">
          <Card>
            <CardContent>
              <DetailList
                items={[
                  ...version.prices.unitPrices.map((item) => ({
                    label: `${POSITION_LABELS[item.position]} (kişi/ay)`,
                    value: formatMoney(item.monthly),
                  })),
                  {
                    label: "Fazla mesai saat ücreti",
                    value: formatMoney(version.prices.overtimeHourly),
                  },
                  {
                    label: "Aylık malzeme bedeli",
                    value: formatMoney(version.prices.materialMonthly),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="kurallar">
          <Card>
            <CardContent>
              <DetailList
                items={[
                  {
                    label: "Eksik personel kesintisi",
                    value: `Günlük fiyatın %${version.rules.shortfallDeductionPercent}'i`,
                  },
                  {
                    label: "Eksik kişi-gün başı ceza",
                    value:
                      version.rules.shortfallPenaltyPerPersonDay > 0
                        ? formatMoney(
                            version.rules.shortfallPenaltyPerPersonDay
                          )
                        : "Yok",
                  },
                  { label: "KDV", value: `%${version.rules.vatRate}` },
                  {
                    label: "Fiyat farkı",
                    value:
                      PRICE_ADJUSTMENT_LABELS[
                        version.rules.priceAdjustment.kind
                      ],
                  },
                  {
                    label: "Ceza maddeleri",
                    value:
                      version.rules.penalties
                        .map((item) => item.label)
                        .join(", ") || "Yok",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="surumler" className="flex flex-col gap-6">
          <div className="rounded-lg border">
            <Table scrollLabel="Sözleşme sürümleri tablosu">
              <caption className="sr-only">Sözleşme sürümleri</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Sürüm</TableHead>
                  <TableHead>Yürürlük</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead>Oluşturan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contract.versions.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{versionLabel(item.number)}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(item.effectiveFrom)} –{" "}
                      {formatDate(item.effectiveTo)}
                    </TableCell>
                    <TableCell>{item.note ?? "—"}</TableCell>
                    <TableCell>{item.createdBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {contract.versions.length > 1 ? (
            <VersionCompare versions={contract.versions} />
          ) : null}
        </TabsContent>
      </Tabs>
      <AddendumDialog
        contract={contract}
        open={addendum}
        onClose={() => {
          setAddendum(false)
        }}
      />
    </div>
  )
}
