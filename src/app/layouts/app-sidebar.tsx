import type { ReactNode } from "react"
import { NavLink, useLocation } from "react-router"

import { Badge } from "@/shared/ui/badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/shared/ui/sidebar"

import { paths } from "../router/paths"
import type { NavSection } from "./navigation"

/**
 * Yan menü. `header` kiracı markasını (logo + firma adı) taşır; menü öğeleri çağıran
 * tarafından yetki ve modüle göre süzülmüş gelir.
 */
export function AppSidebar({
  sections,
  header,
  homePath,
  footer,
}: {
  sections: NavSection[]
  header: ReactNode
  homePath?: string
  footer?: ReactNode
}) {
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  // Mobilde menü tam ekran açılır; sayfa seçilince kapanmalı
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon" aria-label="Ana menü">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<NavLink to={homePath ?? paths.home()} />}
              onClick={closeOnMobile}
            >
              {header}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const Icon = item.icon
                  if (!item.to) {
                    return (
                      <SidebarMenuItem key={item.label}>
                        <SidebarMenuButton
                          aria-disabled
                          tooltip={`${item.label} (Faz ${item.phase})`}
                          className="cursor-not-allowed opacity-60"
                        >
                          <Icon />
                          <span className="flex-1">{item.label}</span>
                          <Badge variant="outline" className="text-[10px]">
                            Faz {item.phase}
                          </Badge>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  }
                  const exact = item.to === "/" || item.to === homePath
                  const active = exact
                    ? pathname === item.to
                    : pathname.startsWith(item.to)
                  return (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<NavLink to={item.to} end={exact} />}
                        onClick={closeOnMobile}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {footer ? <SidebarFooter>{footer}</SidebarFooter> : null}
      <SidebarRail />
    </Sidebar>
  )
}
