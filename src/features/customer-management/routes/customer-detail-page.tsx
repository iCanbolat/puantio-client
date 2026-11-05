import { useQuery } from "@tanstack/react-query"
import { MapPinIcon, PencilIcon } from "lucide-react"
import { useState } from "react"
import { Link, useParams } from "react-router"

import {
  CUSTOMER_SECTOR_LABELS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  customerQueries,
} from "@/entities/customer"
import { locationQueries } from "@/entities/location"
import { Can } from "@/entities/session"
import { useTerms } from "@/entities/tenant"
import { DetailList } from "@/shared/components/detail-list"
import { EmptyState } from "@/shared/components/empty-state"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { StatusBadge } from "@/shared/components/status-badge"
import { paths } from "@/shared/config/paths"
import { formatDateTime } from "@/shared/lib/format"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table"

import { CustomerDialog } from "../components/customer-dialog"

export function CustomerDetailPage() {
  const { customerId = "" } = useParams()
  const terms = useTerms()
  const query = useQuery(customerQueries.detail(customerId))
  const locations = useQuery(
    locationQueries.list({ page: 1, pageSize: 50, customerId })
  )
  const [editing, setEditing] = useState(false)

  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  const customer = query.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={customer.name}
        description={`${customer.code} · ${CUSTOMER_TYPE_LABELS[customer.type]} · ${CUSTOMER_SECTOR_LABELS[customer.sector]}`}
        actions={
          <Can permission="customer:write">
            <Button
              variant="outline"
              onClick={() => {
                setEditing(true)
              }}
            >
              <PencilIcon data-icon="inline-start" />
              Düzenle
            </Button>
          </Can>
        }
      />
      <Card>
        <CardContent>
          <DetailList
            items={[
              {
                label: "Durum",
                value: (
                  <StatusBadge
                    tone={customer.status === "active" ? "success" : "neutral"}
                  >
                    {CUSTOMER_STATUS_LABELS[customer.status]}
                  </StatusBadge>
                ),
              },
              { label: "Vergi kimlik no", value: customer.taxNumber },
              { label: "Vergi dairesi", value: customer.taxOffice },
              {
                label: "Son güncelleme",
                value: formatDateTime(customer.updatedAt),
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>İletişim kişileri</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              İletişim kişisi eklenmemiş.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {customer.contacts.map((contact) => (
                <li
                  key={`${contact.name}-${contact.email ?? ""}`}
                  className="rounded-xl border p-3 text-sm"
                >
                  <p className="font-medium">
                    {contact.name}
                    {contact.isPrimary ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Birincil
                      </span>
                    ) : null}
                  </p>
                  {contact.title ? (
                    <p className="text-muted-foreground">{contact.title}</p>
                  ) : null}
                  {contact.phone ? (
                    <a
                      className="block hover:underline"
                      href={`tel:${contact.phone.replace(/\s/g, "")}`}
                    >
                      {contact.phone}
                    </a>
                  ) : null}
                  {contact.email ? (
                    <a
                      className="block hover:underline"
                      href={`mailto:${contact.email}`}
                    >
                      {contact.email}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{terms.location.plural}</CardTitle>
        </CardHeader>
        <CardContent>
          {locations.isPending ? null : locations.data?.items.length ? (
            <Table>
              <TableCaption className="sr-only">
                Müşteriye bağlı {terms.lower(terms.location, true)}
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Kod</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>
                    {terms.orgLevels.at(-1)?.singular ?? "Bölge"}
                  </TableHead>
                  <TableHead>İl</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locations.data.items.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="font-mono text-xs">
                      {location.code}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={paths.locations.detail(location.id)}
                        className="hover:underline"
                      >
                        {location.name}
                      </Link>
                    </TableCell>
                    <TableCell>{location.orgUnitName}</TableCell>
                    <TableCell>{location.address.city}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={MapPinIcon}
              title={`${terms.location.singular} yok`}
            />
          )}
        </CardContent>
      </Card>
      <CustomerDialog
        open={editing}
        customer={customer}
        onClose={() => {
          setEditing(false)
        }}
      />
    </div>
  )
}
