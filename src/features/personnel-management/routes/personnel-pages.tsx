import { useQuery } from "@tanstack/react-query"
import { EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { z } from "zod"

import {
  PERSONNEL_STATUS_LABELS,
  POSITION_LABELS,
  personnelFullName,
  personnelQueries,
} from "@/entities/personnel"
import { Can } from "@/entities/session"
import { SERVICE_LINE_LABELS, useTerms } from "@/entities/tenant"
import { DetailList } from "@/shared/components/detail-list"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { useSearchParamsState } from "@/shared/hooks/use-search-params-state"
import { formatDate } from "@/shared/lib/format"
import { formatTrMobile } from "@/shared/lib/phone"
import { maskTckn } from "@/shared/lib/tckn"
import { Button, buttonVariants } from "@/shared/ui/button"
import { Card, CardContent } from "@/shared/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs"

import { PersonnelForm } from "../components/personnel-form"
import { STATUS_TONES } from "../components/personnel-status"

export function PersonnelCreatePage() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Yeni personel"
        description="Personel tüzel kişiliğe (işveren) ve isteğe bağlı olarak ana lokasyona bağlanır."
      />
      <PersonnelForm
        person={null}
        onSaved={(person) => void navigate(paths.personnel.detail(person.id))}
        onCancel={() => void navigate(paths.personnel.list())}
      />
    </div>
  )
}

export function PersonnelEditPage() {
  const { personnelId = "" } = useParams()
  const navigate = useNavigate()
  const query = useQuery(personnelQueries.detail(personnelId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={personnelFullName(query.data)}
        description={`${query.data.employeeNumber} · Düzenle`}
      />
      <PersonnelForm
        person={query.data}
        onSaved={(person) => void navigate(paths.personnel.detail(person.id))}
        onCancel={() => void navigate(paths.personnel.detail(personnelId))}
      />
    </div>
  )
}

const TABS = [
  { value: "genel", label: "Genel" },
  { value: "vardiya", label: "Vardiya", phase: "2" },
  { value: "puantaj", label: "Puantaj", phase: "2" },
  { value: "izin", label: "İzin", phase: "2" },
  { value: "zimmet", label: "Zimmet", phase: "5" },
  { value: "isg", label: "İSG", phase: "6" },
  { value: "ozluk", label: "Özlük", phase: "6" },
] as const
type TabValue = (typeof TABS)[number]["value"]
const tabSchema = z.object({
  sekme: z
    .enum(TABS.map((tab) => tab.value) as [TabValue, ...TabValue[]])
    .catch("genel"),
})

/** KVKK: tam kimlik bilgisi ekranda maskeli başlar; kullanıcı bilinçli olarak gösterir. */
function SensitiveValue({
  value,
  masked,
  label,
}: {
  value: string | null
  masked: string | null
  label: string
}) {
  const [revealed, setRevealed] = useState(false)
  if (!value) return <span className="font-mono">{masked ?? "—"}</span>
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{revealed ? value : masked}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={revealed ? `${label} gizle` : `${label} göster`}
        aria-pressed={revealed}
        onClick={() => {
          setRevealed((current) => !current)
        }}
      >
        {revealed ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </span>
  )
}

export function PersonnelDetailPage() {
  const { personnelId = "" } = useParams()
  const terms = useTerms()
  const [{ sekme }, setTab] = useSearchParamsState(tabSchema)
  const query = useQuery(personnelQueries.detail(personnelId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const person = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {personnelFullName(person)}
            <StatusBadge tone={STATUS_TONES[person.status]}>
              {PERSONNEL_STATUS_LABELS[person.status]}
            </StatusBadge>
          </span>
        }
        description={`${person.employeeNumber} · ${POSITION_LABELS[person.position]} · ${person.legalEntityName}`}
        actions={
          <Can permission="personnel:write">
            <Link
              to={paths.personnel.edit(person.id)}
              className={buttonVariants()}
            >
              <PencilIcon data-icon="inline-start" />
              Düzenle
            </Link>
          </Can>
        }
      />
      <Tabs
        value={sekme}
        onValueChange={(value) => {
          setTab({ sekme: value as TabValue })
        }}
      >
        <TabsList className="flex-wrap">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="genel" className="pt-4">
          <Card>
            <CardContent>
              <DetailList
                items={[
                  {
                    label: "T.C. Kimlik No",
                    value: (
                      <SensitiveValue
                        value={person.tckn}
                        masked={
                          person.tckn
                            ? maskTckn(person.tckn)
                            : person.tcknMasked
                        }
                        label="T.C. Kimlik No"
                      />
                    ),
                  },
                  {
                    label: "Cep telefonu",
                    value: (
                      <SensitiveValue
                        value={
                          person.phone ? formatTrMobile(person.phone) : null
                        }
                        masked={person.phoneMasked}
                        label="Telefon"
                      />
                    ),
                  },
                  {
                    label: "Hizmet hattı",
                    value: SERVICE_LINE_LABELS[person.serviceLine],
                  },
                  {
                    label: `Ana ${terms.lower(terms.location)}`,
                    value: person.homeLocationId ? (
                      <Link
                        className="hover:underline"
                        to={paths.locations.detail(person.homeLocationId)}
                      >
                        {person.homeLocationName}
                      </Link>
                    ) : person.isFloater ? (
                      "Yedek havuzu"
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: terms.orgLevels.at(-1)?.singular ?? "Bölge",
                    value: person.orgUnitName,
                  },
                  { label: "İşveren", value: person.legalEntityName },
                  { label: "İşe giriş", value: formatDate(person.hireDate) },
                  ...(person.terminationDate
                    ? [
                        {
                          label: "İşten çıkış",
                          value: formatDate(person.terminationDate),
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
        {TABS.filter((tab) => "phase" in tab).map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="pt-4">
            <EmptyState
              title={tab.label}
              description={`Bu sekme Faz ${"phase" in tab ? tab.phase : ""}'de doldurulacak.`}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
