import React from "react"
import { Geist } from "next/font/google";
import { cn } from "@/src/lib/utils";
import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css"

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" className={cn("font-sans", geist.variable)}>
      <body>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </body>
    </html>
  )
}