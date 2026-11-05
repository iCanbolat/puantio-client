import { TriangleAlertIcon } from "lucide-react"
import { Link } from "react-router"

import { paths } from "@/shared/config/paths"
import { buttonVariants } from "@/shared/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card"

/** Keycloak dönüşü işlenemedi (süresi geçmiş kod, iptal, durum uyuşmazlığı). */
export function LoginCallbackError() {
  return (
    <Card className="w-full max-w-md" role="alert">
      <CardHeader className="items-center text-center">
        <TriangleAlertIcon className="size-8 text-destructive" aria-hidden />
        <CardTitle>
          <h1 className="font-heading text-xl font-semibold">
            Giriş tamamlanamadı
          </h1>
        </CardTitle>
        <CardDescription>
          Giriş isteğinin süresi dolmuş veya iptal edilmiş olabilir.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Link to={paths.login()} className={buttonVariants()}>
          Tekrar giriş yap
        </Link>
      </CardContent>
    </Card>
  )
}
