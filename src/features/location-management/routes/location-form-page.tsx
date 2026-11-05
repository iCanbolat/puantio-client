import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "react-router"

import { locationQueries } from "@/entities/location"
import { useTerms } from "@/entities/tenant"
import { ErrorState } from "@/shared/components/error-state"
import { PageHeader } from "@/shared/components/page-header"
import { PageSkeleton } from "@/shared/components/page-skeleton"
import { paths } from "@/shared/config/paths"

import { LocationForm } from "../components/location-form"

export function LocationCreatePage() {
  const terms = useTerms()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Yeni ${terms.lower(terms.location)}`}
        description="Geofence, saha uygulamasındaki giriş-çıkışların konum doğrulamasında kullanılır."
      />
      <LocationForm
        location={null}
        onSaved={(location) =>
          void navigate(paths.locations.detail(location.id))
        }
        onCancel={() => void navigate(paths.locations.list())}
      />
    </div>
  )
}

export function LocationEditPage() {
  const { locationId = "" } = useParams()
  const navigate = useNavigate()
  const query = useQuery(locationQueries.detail(locationId))
  if (query.isPending) return <PageSkeleton />
  if (query.isError)
    return (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${query.data.code} · ${query.data.name}`}
        description="Düzenle"
      />
      <LocationForm
        location={query.data}
        onSaved={(location) =>
          void navigate(paths.locations.detail(location.id))
        }
        onCancel={() => void navigate(paths.locations.detail(locationId))}
      />
    </div>
  )
}
