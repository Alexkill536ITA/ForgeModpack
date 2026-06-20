import { FabricGameVersionsResponse, FabricLoaderVersionsResponse, ForgeMavenMetadata, MinecraftManifest, ModLoaderManifest, NeoForgeVersions, QuiltGameVersionsResponse, QuiltLoaderVersionsResponse } from "../model/manifest-mc-ml"

import { fetch } from "@tauri-apps/plugin-http";

export function getMinecraftManifest(): Promise<MinecraftManifest> {
    return fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .then((res) => res.json());
}

export function getForgeManifest(): Promise<ForgeMavenMetadata> {
    return fetch("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json")
        .then((res) => res.json());
}

export function getNeoForgeManifest(): Promise<NeoForgeVersions> {
    return fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
        .then((res) => res.json());
}

export function getFabricLoaderManifest(): Promise<FabricLoaderVersionsResponse> {
    return fetch("https://meta.fabricmc.net/v2/versions/loader")
        .then((res) => res.json());
}

export function getFabricGameManifest(): Promise<FabricGameVersionsResponse> {
    return fetch("https://meta.fabricmc.net/v2/versions/game")
        .then((res) => res.json());
}

export function getQuilLoadertManifest(): Promise<QuiltLoaderVersionsResponse> {
    return fetch("https://meta.quiltmc.org/v3/versions/loader")
        .then((res) => res.json());
}

export function getQuilGameManifest(): Promise<QuiltGameVersionsResponse> {
    return fetch("https://meta.quiltmc.org/v3/versions/game")
        .then((res) => res.json());
}

/* --- */

export function updateModLoaderManifest(): Promise<ModLoaderManifest> {
    return Promise.all([
        getForgeManifest(),
        getNeoForgeManifest(),
        getFabricLoaderManifest(),
        getFabricGameManifest(),
        getQuilLoadertManifest(),
        getQuilGameManifest()
    ]).then(([forge, neoforge, fabricLoader, fabricGame, quiltLoader, quiltGame]) => {
        return {
            forge: forge,
            neoforge: neoforge,
            fabric: {
                loader: fabricLoader,
                game: fabricGame
            },
            quilt: {
                loader: quiltLoader,
                game: quiltGame
            }
        }
    });
}