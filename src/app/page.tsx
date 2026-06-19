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

const minecraftVersionsList = ["1.19.2",
  "1.19.1",
  "1.19",
  "1.18.2",
  "1.18.1",
  "1.18",
  "1.17.1",
  "1.17",] as const

export default function Page() {
  const projectState = useAppSelector((state) => state.project)
  const dispatch = useAppDispatch()

  async function handleOpen() {
    const project = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Project", extensions: ["json"] },
      ]
    });
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
    dispatch(updateProject(setByPath(projectState.project, path, value) as project));
  }

  return (<>
    <Button onClick={() => { console.log(projectState.project) }} >log</Button>
    {projectState.project && (
      <>
        <div className="w-full flex gap-4">
          {/* Project Metadata  */}
          <Card className="w-1/2">
            <CardHeader>
              <CardTitle className="text-2xl"> Details</CardTitle>
            </CardHeader>
            <CardContent className="felx flex-col space-y-2">
              <div className='grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4'>
                <div className='w-full space-y-2'>
                  <Label htmlFor={"name"}>Name</Label>
                  <Input id={"name"} type='text' placeholder='Name' onChange={(e) => handleUpdateField("metadata.name", e.target.value)} />
                </div>
                <div className='w-full space-y-2'>
                  <Label htmlFor={"version"}>Version</Label>
                  <Input id={"version"} type='text' placeholder='1.0.0' onChange={(e) => handleUpdateField("metadata.version", e.target.value)} />
                </div>
              </div>
              <div className='w-full space-y-2'>
                <Label htmlFor={"description"}>Description</Label>
                <Textarea id={"description"} placeholder='Description' className="resize-none" onChange={(e) => handleUpdateField("metadata.description", e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Mod Loader  */}
          <Card className="w-1/2">
            <CardHeader>
              <CardTitle className="text-2xl">Dependencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className='flex items-center space-x-2'>
                <Image src="/Minecraft.png" width={56} height={56} alt="Minecraft Logo" />
                <div className='w-full space-y-2'>
                  <Label htmlFor={"minecraftVersion"}>Minecraft Version</Label>
                  <Combobox items={minecraftVersionsList} onValueChange={(e) => handleUpdateField("modloader.mcversion", e)} >
                    <ComboboxInput placeholder='Select a version' />
                    <ComboboxContent>
                      <ComboboxEmpty>Version not found.</ComboboxEmpty>
                      <ComboboxList>
                        {item => (
                          <ComboboxItem key={item} value={item}>
                            {item}
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
                <Input id={"modLoaderVersion"} type='text' placeholder='Select a version' onChange={(e) => handleUpdateField("modloader.version", e.target.value)} />
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
          <Button className='w-full' type='submit' onClick={handleCreate}>Create</Button>
          <Separator className="mb-2" />
          <Button className='w-full' type='button' onClick={handleOpen}>Open</Button>
        </div>

      </div>
    </>}
  </>)
}
