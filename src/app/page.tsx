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
import { Button } from "../components/ui/button";
import { ProjectGate } from "../components/project-gate";
import { modloaderTypes, toastStyles } from "../model/models";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { updateProject } from "../redux/project-slice";
import { setByPath } from "../lib/json-data";
import { RefreshCcwIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner"
import { VersionEntry } from "../model/manifest-mc-ml";
import { getMinecraftManifestCached, getModLoaderManifestCached } from "../lib/manifest-cache";
import { loadManifest } from "../redux/metadata-ml-slice";
import { updateMinecraftManifest } from "../redux/metadata-mc-slice";
import { cn } from "../lib/utils";

// NeoForge esiste solo a partire da Minecraft 1.20.1: sotto questa minor il
// toggle va disabilitato.
const NEOFORGE_MIN_MINOR = 20;

export default function Page() {
  const [updatingManifest, setUpdatingManifest] = useState(false)

  const projectState = useAppSelector((state) => state.project)
  const minecraftManifest = useAppSelector((state) => state.minecraftManifest)
  const modLoaderManifest = useAppSelector((state) => state.modLoaderManifest)
  const dispatch = useAppDispatch()

  const mcVersion = projectState.project?.modloader.mcversion
  const modloaderType = projectState.project?.modloader.type

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
    switch (modloaderType) {
      case modloaderTypes.FORGE: return forgeVersions
      case modloaderTypes.NEOFORGE: return neoforgeVersions
      case modloaderTypes.FABRIC: return fabricVersions
      case modloaderTypes.QUILT: return quiltVersions
      default: return []
    }
  }, [modloaderType, forgeVersions, neoforgeVersions, fabricVersions, quiltVersions])

  // NeoForge è disponibile solo da MC 1.20.1 in poi nel vecchio schema "1.x":
  // lì serve minor >= 20. Nei nuovi schemi di versioning (major != "1",
  // es. "26.1") NeoForge esiste sempre, quindi non va disabilitato.
  const [mcMajor, mcMinorStr] = (mcVersion ?? "").split(".")
  const mcMinor = Number(mcMinorStr)
  const neoforgeDisabled =
    !mcVersion ||
    (mcMajor === "1" && (Number.isNaN(mcMinor) || mcMinor < NEOFORGE_MIN_MINOR))

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

    dispatch(updateProject(updated));
  }

  async function updateManifest() {
    // force = true: ignora la cache e riscarica sempre dalle API, aggiornando
    // poi il DB SQLite.
    setUpdatingManifest(true);
    try {
      const [mc, modLoaders] = await Promise.all([
        getMinecraftManifestCached(true),
        getModLoaderManifestCached(true),
      ]);
      dispatch(updateMinecraftManifest(mc));
      dispatch(loadManifest(modLoaders));
      toast.success("Updated successfully", {
        position: "top-right", style: toastStyles.success
      });
    } catch (error) {
      console.error(error);
      toast.error("Update failed", {
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
              <CardHeader>
                <CardTitle className="text-2xl">Details</CardTitle>
              </CardHeader>
              <CardContent className="h-full flex flex-col space-y-2">
                <div className='grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4'>
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"name"}>Name</Label>
                    <Input id={"name"} type='text' placeholder='Name' value={project.metadata.name} onChange={(e) => handleUpdateField("metadata.name", e.target.value)} />
                  </div>
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"version"}>Version</Label>
                    <Input id={"version"} type='text' placeholder='1.0.0' value={project.metadata.version} onChange={(e) => handleUpdateField("metadata.version", e.target.value)} />
                  </div>
                </div>
                <div className='h-[calc(100%-64px)] space-y-2'>
                  <Label htmlFor={"description"}>Description</Label>
                  <Textarea id={"description"} placeholder='Description' value={project.metadata.description} className="resize-none h-[90%]" onChange={(e) => handleUpdateField("metadata.description", e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* Mod Loader  */}
            <Card className="w-1/2">
              <CardHeader className="flex">
                <CardTitle className="text-2xl">Dependencies</CardTitle>
                <Button variant={"ghost"} onClick={updateManifest} disabled={updatingManifest}>
                  <RefreshCcwIcon className={cn(updatingManifest && "ease-in-out animate-spin")} />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className='flex items-center space-x-2'>
                  <Image src="/Minecraft.png" width={56} height={56} alt="Minecraft Logo" />
                  <div className='w-full space-y-2'>
                    <Label htmlFor={"minecraftVersion"}>Minecraft Version</Label>
                    <Combobox id={"minecraftVersion"} items={minecraftVersions} value={project.modloader.mcversion} onValueChange={(value: string | null) => handleUpdateField("modloader.mcversion", value ?? "")} >
                      <ComboboxInput placeholder='Select a version' />
                      <ComboboxContent>
                        <ComboboxEmpty>Version not found.</ComboboxEmpty>
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
                  <Label className="w-full text-lg" htmlFor={"modLoaderVersion"}>Mod Loader</Label>
                  <ToggleGroup
                    type='single'
                    value={project.modloader.type}
                    onValueChange={value => handleUpdateField("modloader.type", value)}
                    size='lg'
                    className="w-full flex items-center justify-between"
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
                      <Image src="/NeoForge.png" width={80} height={80} alt="Neo Forge Logo" />
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
                  </ToggleGroup>
                </div>

                <div className='w-full space-y-2'>
                  <Label htmlFor={"modLoaderVersion"}>Version</Label>
                  <Combobox
                    items={modloaderVersions}
                    value={project.modloader.version}
                    onValueChange={(value: string | null) => handleUpdateField("modloader.version", value ?? "")} >
                    <ComboboxInput placeholder='Select a version' />
                    <ComboboxContent>
                      <ComboboxEmpty>Version not found.</ComboboxEmpty>
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
              </CardContent>
            </Card>
          </div>

          {/* Project Attributes  */}
          <Card className="h-[39vh]">
            <CardHeader>
              <CardTitle className="text-2xl">Assets</CardTitle>
            </CardHeader>
            <CardContent className="felx flex-col space-y-2">
              <div className='grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4'>
                <div className='w-full space-y-2'>
                  <Label htmlFor={"resourcePack"}>Resource Pack</Label>
                  <Input id={"resourcePack"} placeholder='Resource Pack' />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </ProjectGate>
  )
}
