// https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
// version_manifest_v2.json

export interface MinecraftManifest {
    latest: LatestVersions;
    versions: VersionEntry[];
}

export interface LatestVersions {
    release: string;
    snapshot: string;
}

export interface VersionEntry {
    id: string;
    type: VersionType;
    url: string;
    time: string; // ISO 8601 date string
    releaseTime: string; // ISO 8601 date string
    sha1: string;
    complianceLevel: number;
}

export type VersionType = "release" | "snapshot";

/* --- */

// https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json"
// forge-versions.json

export interface ForgeMavenMetadata {
    [minecraftVersion: string]: string[];
}

/* --- */

// https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
// neoforge-versions.json

export interface NeoForgeVersions {
    isSnapshot: boolean;
    versions: string[];
}

/* --- */

// https://meta.fabricmc.net/v2/versions/loader
// fabric-loader-versions.json

export interface FabricLoaderVersion {
    separator: string;   // es. "." oppure "+build."
    build: number;
    maven: string;       // es. "net.fabricmc:fabric-loader:0.19.2"
    version: string;     // es. "0.19.2"
    stable: boolean;
}

export type FabricLoaderVersionsResponse = FabricLoaderVersion[];

// https://meta.fabricmc.net/v2/versions/game
// fabric-game-versions.json

export interface FabricGameVersion {
    version: string;  // es. "1.21.11", "25w46a", "1.14.2 Pre-Release 4"
    stable: boolean;
}

export type FabricGameVersionsResponse = FabricGameVersion[];

/* --- */

// https://meta.quiltmc.org/v3/versions/loader
// quilt-loader-versions.json

export interface QuiltFileHashes {
    sha1: string;
    sha256: string;
    sha512: string;
}

export interface QuiltLoaderVersion {
    maven: string;        // es. "org.quiltmc:quilt-loader:0.19.2"
    version: string;      // es. "0.19.2"
    build: number;
    separator: string;    // sempre "." nei dati osservati
    file_size: number;    // dimensione del jar in byte
    hashes: QuiltFileHashes;
}

export type QuiltLoaderVersionsResponse = QuiltLoaderVersion[];

// https://meta.quiltmc.org/v3/versions/game
// quilt-game-versions.json

export interface QuiltGameVersion {
    version: string;   // es. "1.21.11", "26w14a"
    stable: boolean;
}

export type QuiltGameVersionsResponse = QuiltGameVersion[];

/* --- */

export interface ModLoaderManifest {
    forge: ForgeMavenMetadata | null,
    neoforge: NeoForgeVersions | null,
    fabric: {
        loader: FabricLoaderVersionsResponse | null,
        game: FabricGameVersionsResponse | null
    },
    quilt: {
        loader: QuiltLoaderVersionsResponse | null,
        game: QuiltGameVersionsResponse | null
    }
}
