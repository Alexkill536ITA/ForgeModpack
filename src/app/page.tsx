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
import { Separator } from "../components/ui/separator";
import { open, save } from '@tauri-apps/plugin-dialog';
import { modloaderTypes, project, asset, mod, keybindsMap } from "../model/models";
import { useAppDispatch, useAppSelector } from "../redux/hooks";
import { updateProject } from "../redux/project-slice";
import { setByPath } from "../lib/json-data";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../components/ui/alert";
import { CircleAlertIcon, RefreshCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { create, exists, readTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner"
import { VersionEntry } from "../model/manifest-mc-ml";
import { getMinecraftManifest, updateModLoaderManifest } from "../lib/get-manifest";
import { loadManifest } from "../redux/metadata-ml-slice";
import { updateMinecraftManifest } from "../redux/metadata-mc-slice";
import { cn } from "../lib/utils";

export default function Page() {
  const [unsaved, setUnsaved] = useState(false)
  const [minecraftVersion, setMinecraftVersion] = useState<any[]>()
  const [modLoaderVersion, setModLoaderVersion] = useState<any>()
  const [forgeVersion, setForgeVersion] = useState<any>()
  const [neoforgeVersion, setNeoForgeVersion] = useState<any>()
  const [quiltVersion, setQuiltVersion] = useState<any>()
  const [fabricVersion, setFabricVersion] = useState<any>()

  const [updateMinecraftState, setUpdateMinecraftState] = useState<boolean>(false)

  const projectState = useAppSelector((state) => state.project)
  const minecraftManifest = useAppSelector((state) => state.minecraftManifest)
  const modLoaderManifest = useAppSelector((state) => state.modLoaderManifest)
  const dispatch = useAppDispatch()

  useEffect(() => {
    setMinecraftVersion(minecraftManifest.versions.filter((version: VersionEntry) => {
      if (version.type === "release") return version
    }))
    setModLoaderVersion(modLoaderManifest)
  }, [minecraftManifest.versions, modLoaderManifest])

  useEffect(() => {
    handleUpdateField("modloader.version", "")
  }, [projectState.project?.modloader.mcversion, projectState.project?.modloader.type])

  useEffect(() => {
    const mcVersion = projectState.project?.modloader.mcversion
    const forgeManifest = modLoaderManifest?.forge

    if (mcVersion?.trim() === "") return
    if (!mcVersion || !forgeManifest) {
      setForgeVersion([])
      return
    }

    const list: string[] = []
    forgeManifest[mcVersion]?.forEach((version) => {
      list.push(version.split("-")[1])
    })

    setForgeVersion(list.reverse())
  }, [projectState.project?.modloader.mcversion, modLoaderManifest?.forge])

  useEffect(() => {
    const mcVersion = projectState.project?.modloader.mcversion
    const neoforgeManifest = modLoaderManifest?.neoforge

    if (mcVersion?.trim() === "") return
    if (!mcVersion || !neoforgeManifest) {
      setNeoForgeVersion([])
      return
    }

    setNeoForgeVersion(neoforgeManifest.versions.filter(v => !v.includes("-") && (v.startsWith(mcVersion.split(".")[0] !== "1" ? mcVersion.split(".")[0] + "." : mcVersion.split(".")[1]))).reverse())
  }, [projectState.project?.modloader.mcversion, modLoaderManifest?.neoforge])

  useEffect(() => {
    const mcVersion = projectState.project?.modloader.mcversion
    const fabricManifest = modLoaderManifest?.fabric

    if (mcVersion?.trim() === "") return
    if (!mcVersion || !fabricManifest) {
      setFabricVersion([])
      return
    }

    const list: string[] = []
    fabricManifest?.loader?.forEach((item) => {
      list.push(item.version)
    })

    setFabricVersion(list)
  })

  useEffect(() => {
    const mcVersion = projectState.project?.modloader.mcversion
    const quiltManifest = modLoaderManifest?.quilt

    if (mcVersion?.trim() === "") return
    if (!mcVersion || !quiltManifest) {
      setQuiltVersion([])
      return
    }

    const list: string[] = []
    quiltManifest?.loader?.forEach((item) => {
      list.push(item.version)
    })

    setQuiltVersion(list)
  }, [projectState.project?.modloader.mcversion, modLoaderManifest?.quilt])

  async function handleOpen() {
    const project = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Project", extensions: ["json"] },
      ]
    });

    if (!project) return;

    const file = await readTextFile(project);
    const json = JSON.parse(file);
    dispatch(updateProject(json));
  }

  async function handleCreate() {
    const workpath = await open({
      multiple: false,
      directory: true,
    });

    if (!workpath) return;

    dispatch(updateProject({
      metadata: {
        name: "",
        version: "",
        description: "",
      },
      modloader: {
        mcversion: "",
        type: modloaderTypes.FORGE,
        version: "",
      },
      assetes: [],
      mods: [],
      keybinds: [],
      configs: {
        workpath: workpath,
      },
    }));
  }

  async function handleUpdateField(path: string, value: string) {
    dispatch(updateProject(setByPath(projectState.project as project, path, value) as project));
    setUnsaved(true);
  }

  async function handleSave() {
    const nameFile = projectState.project?.metadata.name + ".json"

    try {
      const projectFile = await exists(projectState.project?.configs.workpath + "\\" + nameFile);
      if (!projectFile) {
        const filePath = await save({
          defaultPath: nameFile,
          filters: [
            { name: "Project", extensions: ["json"] },
          ]
        });

        if (!filePath) return;
        const file = await create(filePath);
        await file.write(new TextEncoder().encode(JSON.stringify(projectState.project, null, 2)));
        await file.close();

        setUnsaved(false);
        toast.success("Save successfully", { position: "top-right" })
      } else {
        const file = await create(nameFile);
        await file.write(new TextEncoder().encode(JSON.stringify(projectState.project, null, 2)));
        await file.close();

        setUnsaved(false);
        toast.success("Save successfully", { position: "top-right" })
      }
    } catch (error) {
      console.error(error);
      toast.error("Save failed", { position: "top-right", })
    }

  }

  async function updateManifet() {
    setUpdateMinecraftState(true)
    const MCVersion = await getMinecraftManifest();
    dispatch(updateMinecraftManifest(MCVersion));

    const modLoaderManifest = await updateModLoaderManifest();
    dispatch(loadManifest(modLoaderManifest));

    toast.success("Update successfully", { position: "top-right" })
    setUpdateMinecraftState(false)
  }

  return (<>
    {unsaved &&
      <Alert className='border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'>
        <CircleAlertIcon />
        <AlertTitle>Warning not Save</AlertTitle>
        <AlertDescription className='text-amber-600/80 dark:text-amber-400/80'>
          You have unsaved changes
        </AlertDescription>
        <AlertAction className='top-1/2 -translate-y-1/2'>
          <Button type='button' variant='outline' onClick={handleSave}>Save</Button>
        </AlertAction>
      </Alert>
    }

    {projectState.project && (
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
                  <Input id={"name"} type='text' placeholder='Name' value={projectState?.project?.metadata?.name} onChange={(e) => handleUpdateField("metadata.name", e.target.value)} />
                </div>
                <div className='w-full space-y-2'>
                  <Label htmlFor={"version"}>Version</Label>
                  <Input id={"version"} type='text' placeholder='1.0.0' value={projectState?.project?.metadata?.version} onChange={(e) => handleUpdateField("metadata.version", e.target.value)} />
                </div>
              </div>
              <div className='h-[calc(100%-64px)] space-y-2'>
                <Label htmlFor={"description"}>Description</Label>
                <Textarea id={"description"} placeholder='Description' value={projectState?.project?.metadata?.description} className="resize-none h-[90%]" onChange={(e) => handleUpdateField("metadata.description", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Mod Loader  */}
          <Card className="w-1/2">
            <CardHeader className="flex">
              <CardTitle className="text-2xl">Dependencies</CardTitle>
              <Button variant={"ghost"} onClick={updateManifet}>
                <RefreshCcwIcon className={cn(updateMinecraftState && "ease-in-out animate-spin")} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className='flex items-center space-x-2'>
                <Image src="/Minecraft.png" width={56} height={56} alt="Minecraft Logo" />
                <div className='w-full space-y-2'>
                  <Label htmlFor={"minecraftVersion"}>Minecraft Version</Label>
                  <Combobox id={"minecraftVersion"} items={minecraftVersion} placeholder='Select a version' defaultValue={projectState?.project?.modloader?.mcversion} value={projectState?.project?.modloader?.mcversion} onValueChange={(e: any) => handleUpdateField("modloader.mcversion", e)} >
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
                  value={projectState.project.modloader.type}
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
                    disabled={projectState?.project?.modloader?.mcversion?.split('.')[1] <= "19" && projectState?.project?.modloader?.mcversion?.split('.')[0] <= "1"}
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
                  items={projectState.project.modloader.type == modloaderTypes.FORGE ? forgeVersion : projectState.project.modloader.type == modloaderTypes.NEOFORGE ? neoforgeVersion : projectState.project.modloader.type == modloaderTypes.FABRIC ? fabricVersion : quiltVersion}
                  placeholder='Select a version'
                  defaultValue={projectState?.project?.modloader?.version}
                  value={projectState?.project?.modloader?.version}
                  onValueChange={(e: any) => handleUpdateField("modloader.version", e)} >
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

    {!projectState.project && <>
      <div className="h-[85vh] flex flex-col align-middle items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">No project selected</h1>
        <p className="text-lg text-muted-foreground">Create a new project or Select a project to get started.</p>
        <div className='w-full max-w-xs space-y-2'>
          <Button type='button' className='w-full' onClick={handleCreate}>Create</Button>
          <Separator className="mb-2" />
          <Button type='button' className='w-full' onClick={handleOpen}>Open</Button>
        </div>

      </div>
    </>}
  </>)
}
