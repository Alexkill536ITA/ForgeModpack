"use client"

import React from "react"
import { Geist } from "next/font/google";
import { cn } from "@/src/lib/utils";
import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css"
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { AppSidebar } from "../components/app-sidebar";
import { SiteHeader } from "../components/site-header";
import { ScrollArea } from "../components/ui/scroll-area";
import { SaveBar } from "../components/save-bar";
import { Toaster } from "../components/ui/sonner";
import ReduxProvider from "../redux/redux-provider";

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className={cn("font-sans dark", geist.variable)}>
      <body>
        <ReduxProvider>
          <TooltipProvider>
            <SidebarProvider
              style={
                {
                  "--sidebar-width": "calc(var(--spacing) * 72)",
                  "--header-height": "calc(var(--spacing) * 12)",
                } as React.CSSProperties
              }
            >
              <AppSidebar variant="inset" />
              <SidebarInset>
                <SiteHeader />
                <ScrollArea className="h-[90vh]">
                  <div className="flex flex-1 flex-col">
                    <div className="@container/main flex flex-1 flex-col gap-2">
                      <div className="flex flex-col gap-4 p-4 md:gap-6 md:py-6">
                        <SaveBar />
                        {children}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster />
        </ReduxProvider>
      </body>
    </html>
  )
}