export function getMinecraftManifest() {
    return fetch("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .then((res) => res.json())
        .then((data) => data)
}

export function getForgeManifest() {
    return fetch("https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json")
        .then((res) => res.json())
        .then((data) => data)
}

export function getNeoForgeManifest() {
    return fetch("https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge")
        .then((res) => res.json())
        .then((data) => data)
}

export function getFabricManifest() {
    return fetch("https://meta.fabricmc.net/v2/versions/loader")
        .then((res) => res.json())
        .then((data) => data)
}

export function getQuiltManifest() {
    return fetch("https://meta.quiltmc.org/v3/versions/loader")
        .then((res) => res.json())
        .then((data) => data)
}