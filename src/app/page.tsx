"use client"

import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "../components/ui/combobox";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Checkbox } from "../components/ui/checkbox";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { ProjectGate } from "../components/project-gate";
import { asset, modloaderTypes, toastStyles } from "../model/models";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { updateProject } from "../redux/project-slice";
import { setByPath } from "../lib/json-data";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ExternalLinkIcon, FolderIcon, PackageOpenIcon, PencilIcon, PlusIcon, RefreshCcwIcon, SquareKanbanIcon, StickyNoteIcon, Trash2Icon, WallpaperIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner"
import { VersionEntry } from "../model/manifest-mc-ml";
import { getMinecraftManifestCached, getModLoaderManifestCached } from "../lib/manifest-cache";
import { loadManifest } from "../redux/metadata-ml-slice";
import { updateMinecraftManifest } from "../redux/metadata-mc-slice";
import { cn } from "../lib/utils";
import { useBusy } from "../lib/use-busy";
import { useTranslation } from "@/src/i18n/i18n-provider";

// NeoForge esiste solo a partire da Minecraft 1.20.1: sotto questa minor il
// toggle va disabilitato.
const NEOFORGE_MIN_MINOR = 20;

// I datapack sono stati introdotti in Minecraft 1.13: prima non esistono, quindi
// né il loader Datapack né la modalità ibrida hanno senso.
const DATAPACK_MIN_MINOR = 13;

/**
 * True se la versione MC è più vecchia della minor richiesta, cioè se la
 * feature non esiste ancora e il toggle va disabilitato.
 *
 * Ragiona solo sul vecchio schema "1.x" (dove la minor è la generazione del
 * gioco); nei nuovi schemi di versioning (major != "1", es. "26.1") la feature
 * esiste sempre. Senza versione scelta non si può decidere: disabilitato.
 */
function isBelowMcMinor(mcVersion: string | undefined, minMinor: number): boolean {
  if (!mcVersion) return true;
  const [major, minorStr] = mcVersion.split(".");
  if (major !== "1") return false;
  const minor = Number(minorStr);
  return Number.isNaN(minor) || minor < minMinor;
}

// Tipi di risorsa selezionabili nella tabella Assets del progetto.
const ASSET_TYPES = ["Resource Pack", "Shader Pack", "Data Pack", "Config", "Icon", "Splash", "Other"];

export default function Page() {
  const { t } = useTranslation()
  // Overlay bloccante: il refresh scarica i manifest remoti e riscrive la cache.
  const busy = useBusy()
  const [updatingManifest, setUpdatingManifest] = useState(false)

  // Dialog Add/Edit Asset (editingAssetIndex = indice in project.assetes, null in aggiunta).
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [editingAssetIndex, setEditingAssetIndex] = useState<number | null>(null)
  const [assetType, setAssetType] = useState(ASSET_TYPES[0])
  const [assetName, setAssetName] = useState("")
  const [assetPath, setAssetPath] = useState("")
  const [assetUrl, setAssetUrl] = useState("")

  // Dialog Notes: raccolta di note libere del progetto.
  const [notesOpen, setNotesOpen] = useState(false)
  const [newNote, setNewNote] = useState("")

  // Dialog Notes per singola risorsa (assetNotesIndex = indice in project.assetes,
  // null = chiuso).
  const [assetNotesIndex, setAssetNotesIndex] = useState<number | null>(null)
  const [newAssetNote, setNewAssetNote] = useState("")

  const projectState = useAppSelector((state) => state.project)
  const minecraftManifest = useAppSelector((state) => state.minecraftManifest)
  const modLoaderManifest = useAppSelector((state) => state.modLoaderManifest)
  const dispatch = useAppDispatch()

  const mcVersion = projectState.project?.modloader.mcversion
  const modloaderType = projectState.project?.modloader.type
  const hybrid = projectState.project?.modloader.hybrid ?? false
  const hybridLoader = projectState.project?.modloader.hybridLoader
  // Loader classico "effettivo" per il selettore di versione: il type stesso se
  // classico; l'hybridLoader se datapack + ibrido; nessuno se datapack "puro".
  const effectiveLoader =
    modloaderType === modloaderTypes.DATAPACK ? (hybrid ? hybridLoader : undefined) : modloaderType

  // --- Liste versioni derivate dai manifest (memoizzate, niente useState/useEffect) ---

  const minecraftVersions = useMemo<VersionEntry[]>(
    () => minecraftManifest.versions.filter((version) => version.type === "release"),
    [minecraftManifest.versions]
  )

  const forgeVersions = useMemo<string[]>(() => {
    const forge = modLoaderManifest.forge
    if (!mcVersion || !forge) return []
    // Le entry Forge sono nel formato "<mc>-<forge>": teniamo solo la parte Forge.
    return (forge[mcVersion] ?? []).map((version) => version.split("-")[1]).reverse()
  }, [mcVersion, modLoaderManifest.forge])

  const neoforgeVersions = useMemo<string[]>(() => {
    const neoforge = modLoaderManifest.neoforge
    if (!mcVersion || !neoforge) return []
    // Le versioni NeoForge derivano da minor.patch di MC (es. MC 1.21.1 -> "21.1.x").
    const [major, minor] = mcVersion.split(".")
    const prefix = major !== "1" ? `${major}.` : `${minor}.`
    return neoforge.versions
      .filter((version) => !version.includes("-") && version.startsWith(prefix))
      .reverse()
  }, [mcVersion, modLoaderManifest.neoforge])

  // I loader Fabric/Quilt sono universali (indipendenti dalla versione di gioco).
  const fabricVersions = useMemo<string[]>(
    () => modLoaderManifest.fabric.loader?.map((item) => item.version) ?? [],
    [modLoaderManifest.fabric.loader]
  )

  const quiltVersions = useMemo<string[]>(
    () => modLoaderManifest.quilt.loader?.map((item) => item.version) ?? [],
    [modLoaderManifest.quilt.loader]
  )

  const modloaderVersions = useMemo<string[]>(() => {
    switch (effectiveLoader) {
      case modloaderTypes.FORGE: return forgeVersions
      case modloaderTypes.NEOFORGE: return neoforgeVersions
      case modloaderTypes.FABRIC: return fabricVersions
      case modloaderTypes.QUILT: return quiltVersions
      default: return []
    }
  }, [effectiveLoader, forgeVersions, neoforgeVersions, fabricVersions, quiltVersions])

  // Loader non disponibili per la versione MC scelta: NeoForge esiste da 1.20.1,
  // i datapack da 1.13.
  const neoforgeDisabled = isBelowMcMinor(mcVersion, NEOFORGE_MIN_MINOR)
  const datapackDisabled = isBelowMcMinor(mcVersion, DATAPACK_MIN_MINOR)

  // --- Bootstrap manifest all'avvio: carica da cache SQLite, scaricando dalle
  // API solo se la cache è assente o scaduta. Il ref evita il doppio fetch
  // causato dal montaggio doppio di React StrictMode in sviluppo. ---
  const bootstrapped = useRef(false)

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    void (async () => {
      try {
        const [mc, ml] = await Promise.all([
          getMinecraftManifestCached(),
          getModLoaderManifestCached(),
        ])
        dispatch(updateMinecraftManifest(mc))
        dispatch(loadManifest(ml))
      } catch (error) {
        // Silenzioso all'avvio (nessuna cache + offline): l'utente può
        // riprovare con il bottone di refresh.
        console.error(error)
      }
    })()
  }, [dispatch])

  // --- Handlers ---

  function handleUpdateField(path: string, value: string) {
    if (!projectState.project) return;

    let updated = setByPath(projectState.project, path, value);
    // Cambiare versione MC o tipo di modloader invalida la versione del loader
    // selezionata: la azzeriamo per evitare combinazioni incompatibili.
    if (path === "modloader.mcversion" || path === "modloader.type") {
      updated = setByPath(updated, "modloader.version", "");
    }
    // Uscendo da Datapack verso un loader classico, l'ibrido non ha più senso.
    if (path === "modloader.type" && value !== modloaderTypes.DATAPACK) {
      updated = setByPath(updated, "modloader.hybrid", false);
      updated = setByPath(updated, "modloader.hybridLoader", undefined);
    }
    // Scendendo sotto MC 1.13 con un progetto Datapack (o ibrido) si otterrebbe
    // una combinazione impossibile: i datapack non esistono ancora. Si torna al
    // loader di default, avvisando perché la scelta è cambiata da sé.
    if (
      path === "modloader.mcversion" &&
      projectState.project.modloader.type === modloaderTypes.DATAPACK &&
      isBelowMcMinor(value, DATAPACK_MIN_MINOR)
    ) {
      updated = setByPath(updated, "modloader.type", modloaderTypes.FORGE);
      updated = setByPath(updated, "modloader.hybrid", false);
      updated = setByPath(updated, "modloader.hybridLoader", undefined);
      toast.warning(t("dashboard.datapackUnavailable", { version: value }), {
        position: "top-right", style: toastStyles.warning
      });
    }

    dispatch(updateProject(updated));
  }

  // --- Modalità ibrida datapack + gestione cartella datapack ---
  function setHybrid(on: boolean) {
    if (!projectState.project) return
    const modloader = on
      ? { ...projectState.project.modloader, hybrid: true }
      : { ...projectState.project.modloader, hybrid: false, hybridLoader: undefined, version: "" }
    dispatch(updateProject({ ...projectState.project, modloader }))
  }
  function setHybridLoader(loader: modloaderTypes) {
    if (!projectState.project) return
    // Cambiare loader classico invalida la versione selezionata.
    const modloader = { ...projectState.project.modloader, hybridLoader: loader, version: "" }
    dispatch(updateProject({ ...projectState.project, modloader }))
  }
  function setDatapacksPath(path: string) {
    if (!projectState.project) return
    dispatch(updateProject({
      ...projectState.project,
      configs: { ...projectState.project.configs, datapacksPath: path },
    }))
  }

  // --- Assets (project.assetes) ---
  function openAddAsset() {
    setEditingAssetIndex(null)
    setAssetType(ASSET_TYPES[0])
    setAssetName("")
    setAssetPath("")
    setAssetUrl("")
    setAssetDialogOpen(true)
  }
  function openEditAsset(index: number) {
    const a = projectState.project?.assetes?.[index]
    if (!a) return
    setEditingAssetIndex(index)
    setAssetType(a.type || ASSET_TYPES[0])
    setAssetName(a.name)
    setAssetPath(a.path)
    setAssetUrl(a.url ?? "")
    setAssetDialogOpen(true)
  }
  function saveAsset() {
    if (!projectState.project) return
    const name = assetName.trim()
    if (!name) return
    const entry: asset = {
      type: assetType,
      name,
      path: assetPath.trim(),
      ...(assetUrl.trim() ? { url: assetUrl.trim() } : {}),
    }
    const current = projectState.project.assetes ?? []
    const assetes =
      editingAssetIndex !== null
        ? current.map((a, i) => (i === editingAssetIndex ? entry : a))
        : [...current, entry]
    dispatch(updateProject({ ...projectState.project, assetes }))
    setAssetDialogOpen(false)
  }
  function removeAsset(index: number) {
    if (!projectState.project) return
    const assetes = (projectState.project.assetes ?? []).filter((_, i) => i !== index)
    dispatch(updateProject({ ...projectState.project, assetes }))
  }

  // --- Notes (project.notes) ---
  function addNote() {
    if (!projectState.project) return
    const text = newNote.trim()
    if (!text) return
    const notes = [...(projectState.project.notes ?? []), text]
    dispatch(updateProject({ ...projectState.project, notes }))
    setNewNote("")
  }
  function removeNote(index: number) {
    if (!projectState.project) return
    const notes = (projectState.project.notes ?? []).filter((_, i) => i !== index)
    dispatch(updateProject({ ...projectState.project, notes }))
  }

  // --- Notes per singola risorsa (project.assetes[i].notes) ---
  function openAssetNotes(index: number) {
    setNewAssetNote("")
    setAssetNotesIndex(index)
  }
  function addAssetNote() {
    if (!projectState.project || assetNotesIndex === null) return
    const text = newAssetNote.trim()
    if (!text) return
    const assetes = projectState.project.assetes.map((a, i) =>
      i === assetNotesIndex ? { ...a, notes: [...(a.notes ?? []), text] } : a
    )
    dispatch(updateProject({ ...projectState.project, assetes }))
    setNewAssetNote("")
  }
  function removeAssetNote(noteIndex: number) {
    if (!projectState.project || assetNotesIndex === null) return
    const assetes = projectState.project.assetes.map((a, i) =>
      i === assetNotesIndex ? { ...a, notes: (a.notes ?? []).filter((_, j) => j !== noteIndex) } : a
    )
    dispatch(updateProject({ ...projectState.project, assetes }))
  }

  async function updateManifest() {
    // force = true: ignora la cache e riscarica sempre dalle API, aggiornando
    // poi il DB SQLite.
    setUpdatingManifest(true);
    try {
      const [mc, modLoaders] = await busy(t("busy.updatingManifests"), () =>
        Promise.all([
          getMinecraftManifestCached(true),
          getModLoaderManifestCached(true),
        ])
      );
      dispatch(updateMinecraftManifest(mc));
      dispatch(loadManifest(modLoaders));
      toast.success(t("dashboard.updateSuccess"), {
        position: "top-right", style: toastStyles.success
      });
    } catch (error) {
      console.error(error);
      toast.error(t("dashboard.updateFailed"), {
        position: "top-right", style: toastStyles.destructive
      });
    } finally {
      setUpdatingManifest(false);
    }
  }

  return (
    <ProjectGate>
      {(project) => (
        <>
          <div className="w-full flex gap-4">
            {/* Project Metadata  */}
            <Card className="w-1/2">
              <CardHeader className="flex items-center justify-between">
                <div className="flex gap-3 items-center">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    <SquareKanbanIcon className="size-6" />
                  </div>
                  <CardTitle className="text-2xl">{t("dashboard.details")}</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => setNotesOpen(true)}>
                  <StickyNoteIcon /> {(project.notes?.length ?? 0) > 0 ? t("dashboard.notesCount", { count: project.notes!.length }) : t("dashboard.notes")}
                </Button>
              </CardHeader>
              <CardContent className="h-full flex flex-col space-y-2">
                <div className='grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4'>
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"name"}>{t("dashboard.name")}</Label>
                    <Input id={"name"} type='text' placeholder={t("dashboard.namePlaceholder")} value={project.metadata.name} onChange={(e) => handleUpdateField("metadata.name", e.target.value)} />
                  </div>
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"version"}>{t("dashboard.version")}</Label>
                    <Input id={"version"} type='text' placeholder='1.0.0' value={project.metadata.version} onChange={(e) => handleUpdateField("metadata.version", e.target.value)} />
                  </div>
                </div>
                <div className='h-[calc(100%-64px)] space-y-2'>
                  <Label htmlFor={"description"}>{t("dashboard.description")}</Label>
                  <Textarea id={"description"} placeholder={t("dashboard.descriptionPlaceholder")} value={project.metadata.description} className="resize-none h-[90%]" onChange={(e) => handleUpdateField("metadata.description", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Mod Loader  */}
            <Card className="w-1/2">
              <CardHeader className="flex gap-3 items-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <PackageOpenIcon className="size-6" />
                </div>
                <CardTitle className="text-2xl">{t("dashboard.dependencies")}</CardTitle>
                <Button variant={"ghost"} onClick={updateManifest} disabled={updatingManifest}>
                  <RefreshCcwIcon className={cn(updatingManifest && "ease-in-out animate-spin")} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className='flex items-center space-x-2'>
                  <Image src="/Minecraft.png" width={56} height={56} alt="Minecraft Logo" />
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"minecraftVersion"}>{t("dashboard.minecraftVersion")}</Label>
                    <Combobox id={"minecraftVersion"} items={minecraftVersions} value={project.modloader.mcversion} onValueChange={(value: string | null) => handleUpdateField("modloader.mcversion", value ?? "")} >
                      <ComboboxInput placeholder={t("dashboard.selectVersion")} />
                      <ComboboxContent>
                        <ComboboxEmpty>{t("dashboard.versionNotFound")}</ComboboxEmpty>
                        <ComboboxList>
                          {(item: VersionEntry) => (
                            <ComboboxItem key={item.id} value={item.id} className="felx justify-between">
                              {item.id}
                              <span className="text-muted-foreground text-xs">
                                {new Date(item.releaseTime).toLocaleDateString()}
                              </span>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                </div>

                <div className='w-full'>
                  <Label className="w-full text-lg" htmlFor={"modLoaderVersion"}>{t("dashboard.modLoader")}</Label>
                  <ToggleGroup
                    type='single'
                    value={project.modloader.type}
                    onValueChange={value => handleUpdateField("modloader.type", value)}
                    size='lg'
                    className="w-full flex flex-wrap items-center justify-between gap-2"
                  >
                    <ToggleGroupItem
                      value={modloaderTypes.FORGE}
                      aria-label='Forge'
                      className='flex size-32 flex-col items-center justify-center rounded-xl hover:bg-[#ffc24b] hover:border-[#ffc24b]  data-[state=on]:border-[#ffc24b] border-2'
                    >
                      <Image src="/Forge.png" width={80} height={80} alt="Forge Logo" />
                      <span className="text-sm">Forge</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={modloaderTypes.NEOFORGE}
                      aria-label='Neo Forge'
                      disabled={neoforgeDisabled}
                      className='flex size-32 flex-col items-center justify-center rounded-xl hover:bg-[#5bc8e8] hover:border-[#5bc8e8] data-[state=on]:border-[#5bc8e8] border-2'
                    >
                      <Image src="/Neoforge.png" width={80} height={80} alt="Neo Forge Logo" />
                      <span className="text-sm">Neo Forge</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={modloaderTypes.FABRIC}
                      aria-label='Fabric'
                      className='flex size-32 flex-col items-center justify-center rounded-xl hover:bg-[#b48cff] hover:border-[#b48cff] data-[state=on]:border-[#b48cff] border-2'
                    >
                      <Image src="/Fabric.png" width={80} height={80} alt="Fabric Logo" />
                      <span className="text-sm">Fabric</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={modloaderTypes.QUILT}
                      aria-label='Quilt'
                      className='flex size-32 flex-col items-center justify-center rounded-xl hover:bg-[#ff8ac2] hover:border-[#ff8ac2] data-[state=on]:border-[#ff8ac2] border-2'
                    >
                      <Image src="/Quilt.png" width={80} height={80} alt="Quilt Logo" />
                      <span className="text-sm">Quilt</span>
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={modloaderTypes.DATAPACK}
                      aria-label='Datapack'
                      disabled={datapackDisabled}
                      className='flex size-32 flex-col items-center justify-center rounded-xl hover:bg-[#7cc04b] hover:border-[#7cc04b] data-[state=on]:border-[#7cc04b] border-2'
                    >
                      <Image src="/Datapack.png" width={80} height={80} alt="Datapack Logo" />
                      <span className="text-sm">Datapack</span>
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {/* Un toggle disabilitato senza spiegazione sembra un bug:
                      diciamo da quale versione i datapack esistono. */}
                  {datapackDisabled && mcVersion && (
                    <p className='text-muted-foreground mt-2 text-xs'>
                      {t("dashboard.datapackMinVersionHint")}
                    </p>
                  )}
                </div>

                {/* Controlli specifici Datapack: modalità ibrida + cartella datapack */}
                {project.modloader.type === modloaderTypes.DATAPACK && (
                  <div className='w-full space-y-4'>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        id="hybrid"
                        checked={!!project.modloader.hybrid}
                        onCheckedChange={(v) => setHybrid(v === true)}
                      />
                      <Label htmlFor="hybrid" className='cursor-pointer'>
                        {t("dashboard.hybridLabel")}
                      </Label>
                    </div>

                    {project.modloader.hybrid && (
                      <div className='w-full space-y-2'>
                        <Label>{t("dashboard.classicLoader")}</Label>
                        <Select
                          value={project.modloader.hybridLoader ?? ""}
                          onValueChange={(v) => setHybridLoader(v as modloaderTypes)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t("dashboard.selectLoader")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={modloaderTypes.FORGE}>Forge</SelectItem>
                            <SelectItem value={modloaderTypes.NEOFORGE}>Neo Forge</SelectItem>
                            <SelectItem value={modloaderTypes.FABRIC}>Fabric</SelectItem>
                            <SelectItem value={modloaderTypes.QUILT}>Quilt</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className='w-full space-y-2'>
                      <Label htmlFor="datapacksPath">{t("dashboard.datapacksFolder")}</Label>
                      <div className='flex gap-2'>
                        <Input
                          id="datapacksPath"
                          placeholder={`${project.configs.workpath}\\datapacks`}
                          value={project.configs.datapacksPath ?? ""}
                          onChange={(e) => setDatapacksPath(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            const dir = await openDialog({ directory: true, multiple: false })
                            if (typeof dir === "string") setDatapacksPath(dir)
                          }}
                        >
                          <FolderIcon /> {t("dashboard.browse")}
                        </Button>
                      </div>
                      <p className='text-xs text-muted-foreground'>
                        {t("dashboard.datapacksFolderHint")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Version del loader classico. Nascosto in Datapack "puro"
                    (nessun loader effettivo); mostrato in ibrido con loader scelto. */}
                {effectiveLoader && (
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"modLoaderVersion"}>{t("dashboard.version")}</Label>
                    <Combobox
                      items={modloaderVersions}
                      value={project.modloader.version}
                      onValueChange={(value: string | null) => handleUpdateField("modloader.version", value ?? "")} >
                      <ComboboxInput placeholder={t("dashboard.selectVersion")} />
                      <ComboboxContent>
                        <ComboboxEmpty>{t("dashboard.versionNotFound")}</ComboboxEmpty>
                        <ComboboxList>
                          {(item: string) => (
                            <ComboboxItem key={item} value={item}>
                              {item}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Assets: risorse del modpack (tipo, nome, path relativo, link) */}
          <Card className="h-[39vh] flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <div className="flex gap-3 items-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <WallpaperIcon className="size-6" />
                </div>
                <CardTitle className="text-2xl">{t("dashboard.assets")}</CardTitle>
              </div>
              <Button variant="outline" size="sm" onClick={openAddAsset}><PlusIcon /> {t("dashboard.asset")}</Button>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-y-auto">
              {(project.assetes ?? []).length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-muted-foreground">{t("dashboard.noAssets")}</p>
                  <Button variant="outline" size="sm" onClick={openAddAsset}><PlusIcon /> {t("dashboard.addAsset")}</Button>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">{t("dashboard.tableType")}</TableHead>
                        <TableHead>{t("dashboard.tableName")}</TableHead>
                        <TableHead>{t("dashboard.tableRelativePath")}</TableHead>
                        <TableHead>{t("dashboard.tableSource")}</TableHead>
                        <TableHead className="w-36 text-right">{t("dashboard.tableActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(project.assetes ?? []).map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-muted-foreground">{a.type || "—"}</TableCell>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{a.path || "—"}</TableCell>
                          <TableCell>
                            {a.url ? (
                              <button
                                type="button"
                                onClick={() => void openUrl(a.url!)}
                                title={a.url}
                                className="inline-flex max-w-56 items-center gap-1 truncate text-primary hover:underline"
                              >
                                <ExternalLinkIcon className="size-3 shrink-0" />
                                <span className="truncate">{a.url}</span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="relative"
                              onClick={() => openAssetNotes(i)}
                              aria-label={t("dashboard.assetNotes")}
                              title={(a.notes?.length ?? 0) > 0 ? t("dashboard.notesCount", { count: a.notes!.length }) : t("dashboard.notes")}
                            >
                              <StickyNoteIcon />
                              {(a.notes?.length ?? 0) > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                                  {a.notes!.length}
                                </span>
                              )}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditAsset(i)} aria-label={t("dashboard.editAsset")}>
                              <PencilIcon />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeAsset(i)} aria-label={t("dashboard.removeAsset")}>
                              <Trash2Icon />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialog Add/Edit Asset */}
          <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAssetIndex !== null ? t("dashboard.editAsset") : t("dashboard.addAsset")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("dashboard.tableType")}</Label>
                  <Select value={assetType} onValueChange={setAssetType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("dashboard.tableType")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSET_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset-name">{t("dashboard.tableName")}</Label>
                  <Input id="asset-name" placeholder={t("dashboard.assetNamePlaceholder")} value={assetName} onChange={(e) => setAssetName(e.target.value)} autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset-path">{t("dashboard.tableRelativePath")}</Label>
                  <Input id="asset-path" placeholder={t("dashboard.assetPathPlaceholder")} value={assetPath} onChange={(e) => setAssetPath(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="asset-url">{t("dashboard.assetUrlLabel")}</Label>
                  <Input id="asset-url" placeholder="https://..." value={assetUrl} onChange={(e) => setAssetUrl(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={saveAsset} disabled={!assetName.trim()}>
                  {editingAssetIndex !== null ? t("dashboard.save") : t("dashboard.add")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog Notes: raccolta di note libere del progetto (add/remove) */}
          <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
            <DialogContent className="max-w-4xl!">
              <DialogHeader>
                <DialogTitle>{t("dashboard.notes")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Aggiunta nuova nota */}
                <div className="flex items-start gap-2">
                  <Textarea
                    placeholder={t("dashboard.writeNote")}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-16 flex-1 resize-none"
                    onKeyDown={(e) => {
                      // Ctrl/Cmd+Enter = aggiungi (Enter da solo va a capo).
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault()
                        addNote()
                      }
                    }}
                  />
                  <Button type="button" onClick={addNote} disabled={!newNote.trim()} aria-label={t("dashboard.addNote")}>
                    <PlusIcon />
                  </Button>
                </div>
                {/* Elenco note */}
                {(project.notes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("dashboard.noNotes")}</p>
                ) : (
                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {(project.notes ?? []).map((n, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2">
                        <p className="whitespace-pre-wrap break-words text-sm">{n}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive"
                          onClick={() => removeNote(i)}
                          aria-label={t("dashboard.removeNote")}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Dialog Notes della singola risorsa (add/remove), montata solo se aperta */}
          {assetNotesIndex !== null && (() => {
            const a = project.assetes?.[assetNotesIndex]
            if (!a) return null
            const notes = a.notes ?? []
            return (
              <Dialog open onOpenChange={(o) => !o && setAssetNotesIndex(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("dashboard.notesFor", { name: a.name || t("dashboard.assetFallbackName") })}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Aggiunta nuova nota */}
                    <div className="flex items-start gap-2">
                      <Textarea
                        placeholder={t("dashboard.writeNote")}
                        value={newAssetNote}
                        onChange={(e) => setNewAssetNote(e.target.value)}
                        className="min-h-16 flex-1 resize-none"
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault()
                            addAssetNote()
                          }
                        }}
                      />
                      <Button type="button" onClick={addAssetNote} disabled={!newAssetNote.trim()} aria-label={t("dashboard.addNote")}>
                        <PlusIcon />
                      </Button>
                    </div>
                    {/* Elenco note */}
                    {notes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("dashboard.noNotes")}</p>
                    ) : (
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {notes.map((n, i) => (
                          <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2">
                            <p className="whitespace-pre-wrap break-words text-sm">{n}</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-destructive"
                              onClick={() => removeAssetNote(i)}
                              aria-label={t("dashboard.removeNote")}
                            >
                              <Trash2Icon />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )
          })()}
        </>
      )}
    </ProjectGate>
  )
}
