import { Avatar, AvatarFallback, AvatarImage } from "@cockpit/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cockpit/ui/components/dropdown-menu"
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
} from "@cockpit/ui/components/sidebar"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronsUpDownIcon,
  LayoutGridIcon,
  LogOutIcon,
  SettingsIcon,
  SquareKanbanIcon,
  TargetIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Logo } from "~/components/logo"
import { authClient, type Session } from "~/lib/auth-client"
import { unwrap } from "~/lib/auth-errors"

type NavItem = {
  title: string
  to: "/" | "/finances" | "/projects" | "/board" | "/settings"
  icon: LucideIcon
}

/** Sections get added here as they're built. */
const nav: NavItem[] = [
  { title: "Overview", to: "/", icon: LayoutGridIcon },
  { title: "Projects", to: "/projects", icon: TargetIcon },
  { title: "Board", to: "/board", icon: SquareKanbanIcon },
  { title: "Finances", to: "/finances", icon: WalletIcon },
]

const accountNav: NavItem[] = [{ title: "Settings", to: "/settings", icon: SettingsIcon }]

export function AppSidebar({ user }: { user: Session["user"] }) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-4 pt-4 pb-2">
        <Link to="/" aria-label="Cockpit home">
          <Logo />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavMenu items={nav} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavMenu items={accountNav} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

function NavMenu({ items }: { items: NavItem[] }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          {/* Sections stay highlighted on their sub-pages (a single project, for example). */}
          <Link to={item.to} activeOptions={{ exact: item.to === "/", includeSearch: false }}>
            {({ isActive }) => (
              <SidebarMenuButton asChild isActive={isActive}>
                <span>
                  <item.icon />
                  <span>{item.title}</span>
                </span>
              </SidebarMenuButton>
            )}
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function UserMenu({ user }: { user: Session["user"] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signOut = useMutation({
    mutationFn: () => unwrap(authClient.signOut()),
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: "/login", replace: true })
    },
    onError: () => toast.error("Couldn't log out. Try again."),
  })

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <Avatar className="size-8">
                {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="bg-ink text-xs font-semibold text-primary">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{user.name}</span>
                <span className="truncate text-xs font-normal text-body">{user.email}</span>
              </span>
              <ChevronsUpDownIcon className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) rounded-lg"
          >
            <DropdownMenuLabel className="text-xs font-normal text-body">
              Signed in as {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <SettingsIcon />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={signOut.isPending}
              onSelect={(e) => {
                e.preventDefault()
                signOut.mutate()
              }}
            >
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
