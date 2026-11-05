import { useQueryClient } from "@tanstack/react-query"
import { LogInIcon, TriangleAlertIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router"

import { TenantLogo, useTenant, type AuthProvider } from "@/entities/tenant"
import { brand } from "@/shared/config/brand"
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Separator } from "@/shared/ui/separator"
import { Spinner } from "@/shared/ui/spinner"

import { useAuth } from "../components/auth-context"
import { clearUserData } from "../lib/clear-user-data"
import {
  PROVIDER_BUTTON_LABELS,
  discoverProvider,
} from "../lib/provider-discovery"
import { safeReturnTo } from "../lib/return-to"

const REASON_MESSAGES: Record<string, { title: string; description: string }> =
  {
    "oturum-suresi": {
      title: "Oturumunuzun süresi doldu",
      description: "Güvenliğiniz için tekrar giriş yapın.",
    },
    "kiraci-uyusmazligi": {
      title: "Bu hesap bu firmaya ait değil",
      description:
        "Giriş yaptığınız hesap başka bir firmaya tanımlı. Bu firmanın hesabıyla tekrar giriş yapın.",
    },
    cikis: {
      title: "Çıkış yaptınız",
      description: "Tekrar görüşmek üzere.",
    },
  }

export function LoginPage() {
  const tenant = useTenant()
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get("donus"))
  const reason = params.get("neden")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const emailId = useId()
  const autoStarted = useRef<boolean>(false)
  const queryClient = useQueryClient()

  // Oturumsuz giriş ekranı: önceki kullanıcının verisi bellekte kalmasın (KVKK)
  useEffect(() => {
    if (!auth.getSession()) clearUserData(queryClient)
  }, [auth, queryClient])

  const providers = tenant.auth.providers
  const federated = providers.filter((provider) => provider.kind !== "password")
  const hasPassword = providers.some((provider) => provider.kind === "password")
  const single = providers.length === 1 ? providers[0] : undefined
  const alreadySignedIn =
    auth.getSession() !== null && auth.isSessionForTenant()

  const start = async (provider: AuthProvider, loginHint?: string) => {
    setPendingId(provider.id)
    setError(null)
    try {
      const result = await auth.login({
        returnTo,
        idpHint: provider.idpHint,
        loginHint: loginHint ?? null,
      })
      if (result.kind === "completed") {
        await navigate(result.returnTo, { replace: true })
      }
    } catch {
      setError("Giriş başlatılamadı. Lütfen tekrar deneyin.")
      setPendingId(null)
    }
  }

  // Tek sağlayıcı varsa doğrudan yönlendir (çıkış/hata sonrası kullanıcı butona basar)
  const shouldAutoStart = single !== undefined && !reason && !alreadySignedIn
  useEffect(() => {
    if (!single || !shouldAutoStart || autoStarted.current) return
    autoStarted.current = true
    void start(single)
  })

  if (alreadySignedIn) return <Navigate to={returnTo} replace />

  const onEmailSubmit = (event: SyntheticEvent) => {
    event.preventDefault()
    const provider = discoverProvider(providers, email)
    if (!provider) {
      setError("Bu e-posta adresi için giriş yöntemi bulunamadı.")
      return
    }
    void start(provider, email.trim())
  }

  const message = reason ? REASON_MESSAGES[reason] : undefined

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <TenantLogo tenant={tenant} className="size-12 text-base" />
        <CardTitle>
          <h1 className="font-heading text-xl font-semibold">
            {tenant.displayName}
          </h1>
        </CardTitle>
        <CardDescription>
          {brand.productName} {brand.tagline.toLocaleLowerCase("tr-TR")} girişi
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {message ? (
          <Alert>
            <AlertTitle>{message.title}</AlertTitle>
            <AlertDescription>{message.description}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {shouldAutoStart && pendingId ? (
          <p
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner /> Giriş sayfasına yönlendiriliyorsunuz…
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {federated.map((provider) => (
            <Button
              key={provider.id}
              variant="outline"
              size="lg"
              disabled={pendingId !== null}
              onClick={() => void start(provider)}
            >
              {pendingId === provider.id ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <LogInIcon data-icon="inline-start" />
              )}
              {provider.label || PROVIDER_BUTTON_LABELS[provider.kind]}
            </Button>
          ))}
        </div>

        {hasPassword ? (
          <>
            {federated.length > 0 ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                veya
                <Separator className="flex-1" />
              </div>
            ) : null}
            <form className="flex flex-col gap-3" onSubmit={onEmailSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor={emailId}>E-posta adresi</Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  placeholder="ad.soyad@firma.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Kurumsal hesabınız varsa otomatik olarak firmanızın giriş
                  sayfasına yönlendirilirsiniz.
                </p>
              </div>
              <Button type="submit" size="lg" disabled={pendingId !== null}>
                {pendingId !== null &&
                !federated.some((provider) => provider.id === pendingId) ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {PROVIDER_BUTTON_LABELS.password}
              </Button>
            </form>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
