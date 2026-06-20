"use client"

import * as React from "react"

import { NavFiles } from "../components/nav-files"
import { NavMain } from "../components/nav-main"
import { NavSecondary } from "../components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../components/ui/sidebar"
import { LayoutDashboardIcon, ListIcon, ChartBarIcon, FolderIcon, UsersIcon, CameraIcon, FileTextIcon, Settings2Icon, CircleHelpIcon, SearchIcon, DatabaseIcon, FileChartColumnIcon, FileIcon, CommandIcon, HammerIcon, CopyrightIcon, KeyboardIcon, FolderTreeIcon, CpuIcon } from "lucide-react"

const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: (
        <LayoutDashboardIcon
        />
      ),
    },
    {
      title: "List Mods",
      url: "/listmods",
      icon: (
        <ListIcon/>
      ),
    },
    {
      title: "keybinds",
      url: "/keybinds",
      icon: (
        <KeyboardIcon/>
      ),
    },
    {
      title: "JVM",
      url: "/jvm",
      icon: (
        <CpuIcon/>
      ),
    },
    // {
    //   title: "Analytics",
    //   url: "/analytics",
    //   icon: (
    //     <ChartBarIcon/>
    //   ),
    // },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: (
        <Settings2Icon
        />
      ),
    },
    {
      title: "Get Help",
      url: "#",
      icon: (
        <CircleHelpIcon
        />
      ),
    },
    {
      title: "Search",
      url: "#",
      icon: (
        <SearchIcon
        />
      ),
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#">
                <HammerIcon className="size-5!" />
                <span className="text-base font-semibold">Forge Modpack</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavFiles />
        {/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex gap-2 items-center">
          <CopyrightIcon size={16}/>
          <span className="text-xs">2026 Forge Modpack by Alexkill536ITA</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
