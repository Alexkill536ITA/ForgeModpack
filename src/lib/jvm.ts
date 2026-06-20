import type { gcType } from "../model/models"

// Opzioni di garbage collector mostrate nel selettore.
export const GC_OPTIONS: { key: gcType; label: string }[] = [
  { key: "g1", label: "G1GC (Aikar)" },
  { key: "zgc", label: "ZGC" },
  { key: "shen", label: "Shenandoah" },
]

// Genera gli argomenti JVM in base alla RAM (GB) e al garbage collector scelto.
// Il preset G1 corrisponde ai flag "Aikar", standard de-facto per i server modded.
export function buildFlags(ram: number, gc: gcType): string[] {
  const flags = [`-Xms${ram}G`, `-Xmx${ram}G`]
  if (gc === "g1") {
    flags.push(
      "-XX:+UseG1GC", "-XX:+ParallelRefProcEnabled", "-XX:MaxGCPauseMillis=200",
      "-XX:+UnlockExperimentalVMOptions", "-XX:+DisableExplicitGC", "-XX:+AlwaysPreTouch",
      ram >= 12 ? "-XX:G1NewSizePercent=40" : "-XX:G1NewSizePercent=30",
      ram >= 12 ? "-XX:G1MaxNewSizePercent=50" : "-XX:G1MaxNewSizePercent=40",
      ram >= 12 ? "-XX:G1HeapRegionSize=16M" : "-XX:G1HeapRegionSize=8M",
      ram >= 12 ? "-XX:G1ReservePercent=15" : "-XX:G1ReservePercent=20",
      "-XX:G1HeapWastePercent=5", "-XX:G1MixedGCCountTarget=4",
      ram >= 12 ? "-XX:InitiatingHeapOccupancyPercent=20" : "-XX:InitiatingHeapOccupancyPercent=15",
      "-XX:G1MixedGCLiveThresholdPercent=90", "-XX:G1RSetUpdatingPauseTimePercent=5",
      "-XX:SurvivorRatio=32", "-XX:+PerfDisableSharedMem", "-XX:MaxTenuringThreshold=1",
      "-Dusing.aikars.flags=https://mcflags.emc.gs", "-Daikars.new.flags=true",
    )
  } else if (gc === "zgc") {
    flags.push(
      "-XX:+UseZGC", "-XX:+ZGenerational", "-XX:+AlwaysPreTouch",
      "-XX:+DisableExplicitGC", "-XX:+PerfDisableSharedMem", "-XX:ConcGCThreads=2",
    )
  } else {
    flags.push(
      "-XX:+UseShenandoahGC", "-XX:ShenandoahGCMode=iu",
      "-XX:+AlwaysPreTouch", "-XX:+DisableExplicitGC", "-XX:+UseNUMA",
    )
  }
  return flags
}
