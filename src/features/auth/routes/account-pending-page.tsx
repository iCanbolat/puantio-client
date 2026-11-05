import { ShieldQuestionIcon } from "lucide-react"
import { useSearchParams } from "react-router"

import { useTenant } from "@/entities/tenant"
import { Button } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"

import { useSignOut } from "../lib/use-sign-out"

/** Kimlik doğrulandı ama kiracıda uygulama kullanıcısı yok (veya destek oturumu yok). */
export function AccountPendingPage() {
  const tenant = useTenant()
  const [params] = useSearchParams()
  const signOut = useSignOut()
  const isSupport = params.get("neden") === "destek"

  return (
    <Card className="w-full max-w-md" role="alert">
      <CardHeader className="items-center text-center">
        <ShieldQuestionIcon className="size-8 text-amber-600" aria-hidden />
        <CardTitle>
          <h1 className="font-heading text-xl font-semibold">
            {isSupport
              ? "Etkin destek oturumu yok"
              : "Hesabınız yetkilendirilmemiş"}
          </h1>
        </CardTitle>
        <CardDescription>
          {isSupport
            ? `${tenant.displayName} için açık bir destek oturumunuz bulunmuyor. Destek oturumunu platform panelinden gerekçe belirterek başlatın.`
            : `Kimliğiniz doğrulandı ancak ${tenant.displayName} içinde size tanımlı bir kullanıcı yok. Erişim için firma yöneticinize başvurun.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button variant="outline" onClick={() => void signOut()}>
          Farklı bir hesapla giriş yap
        </Button>
      </CardContent>
    </Card>
  )
}
