"use client"

import { useTranslation } from "@/src/i18n/i18n-provider"

import { ProjectGate } from "../../components/project-gate"

function Analytics() {
  const { t } = useTranslation()
  return <span>{t("analytics.title")}</span>
}

export default function AnalyticsPage() {
  return <ProjectGate>{() => <Analytics />}</ProjectGate>
}
