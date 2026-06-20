"use client"

import Color from "color"
import { PipetteIcon } from "lucide-react"
import { Slider } from "radix-ui"
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@/src/lib/utils"
import { Button } from "./button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"
import { Input } from "./input"

interface ColorPickerContextValue {
  hue: number
  saturation: number
  lightness: number
  alpha: number
  mode: string
  setHue: (hue: number) => void
  setSaturation: (saturation: number) => void
  setLightness: (lightness: number) => void
  setAlpha: (alpha: number) => void
  setMode: (mode: string) => void,
  enableAlpha?: boolean
}

const ColorPickerContext = createContext<ColorPickerContextValue | undefined>(undefined)

export const useColorPicker = () => {
  const context = useContext(ColorPickerContext)

  if (!context) {
    throw new Error("useColorPicker must be used within a ColorPickerProvider")
  }

  return context
}

// Vincola un numero all'intervallo [0, 1] (coordinate normalizzate della mappa).
const clampUnit = (n: number) => Math.max(0, Math.min(1, n))

export type ColorPickerProps = HTMLAttributes<HTMLDivElement> & {
  value?: Parameters<typeof Color>[0]
  defaultValue?: Parameters<typeof Color>[0]
  onChange?: (value: string | Parameters<typeof Color>[0]) => void,
  enableAlpha?: boolean,
  format?: "hex" | "rgb" | "css" | "hsl"
}

export const ColorPicker = ({
  value,
  defaultValue = "#000000",
  onChange,
  enableAlpha,
  format = "hex",
  className,
  ...props
}: ColorPickerProps) => {
  const selectedColor = Color(value)
  const defaultColor = Color(defaultValue)

  const [hue, setHue] = useState(selectedColor.hue() || defaultColor.hue() || 0)
  const [saturation, setSaturation] = useState(
    selectedColor.saturationl() || defaultColor.saturationl() || 100,
  )
  const [lightness, setLightness] = useState(
    selectedColor.lightness() || defaultColor.lightness() || 50,
  )
  const [alpha, setAlpha] = useState(selectedColor.alpha() * 100 || defaultColor.alpha() * 100)
  const [mode, setMode] = useState(format as string)

  // Update color when controlled value changes
  useEffect(() => {
    if (value) {
      const color = Color.rgb(value).rgb().object()

      setHue(color.r)
      setSaturation(color.g)
      setLightness(color.b)
      setAlpha(color.a)
    }
  }, [value])

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      const color = Color.hsl(hue, saturation, lightness).alpha(alpha / 100)
      const rgba = color.rgb().array()

      switch (format) {
        case "hex":
          onChange(enableAlpha ? color.hexa() : color.hex())
          break;
        case "rgb":
          onChange(enableAlpha ? rgba : rgba.slice(0, 3))
          break;
        case "css":
          onChange(enableAlpha ? `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${alpha / 100})` : `rgb(${rgba[0]}, ${rgba[1]}, ${rgba[2]})`)
          break;
        case "hsl":
          onChange(enableAlpha ? `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha / 100})` : `hsl(${hue}, ${saturation}%, ${lightness}%)`)
          break;
      }
    }
  }, [hue, saturation, lightness, alpha, onChange])

  return (
    <ColorPickerContext.Provider
      value={{
        hue,
        saturation,
        lightness,
        alpha,
        mode,
        setHue,
        setSaturation,
        setLightness,
        setAlpha,
        setMode,
        enableAlpha,
      }}
    >
      <div className={cn("flex size-full flex-col gap-4", className)} {...(props as any)} />
    </ColorPickerContext.Provider>
  )
}

export type ColorPickerSelectionProps = HTMLAttributes<HTMLDivElement>

export const ColorPickerSelection = memo(({ className, ...props }: ColorPickerSelectionProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [positionX, setPositionX] = useState(0)
  const [positionY, setPositionY] = useState(0)
  const { hue, saturation, lightness, setSaturation, setLightness } = useColorPicker()

  // Quando il colore cambia da fuori (input testuali, eyedropper, slider hue),
  // riposiziona il cursore della mappa 2D ricavando x/y da saturation/lightness.
  // È l'inverso esatto della mappatura usata in handlePointerMove. Durante il
  // drag non interviene (è il puntatore a guidare la posizione).
  useEffect(() => {
    if (isDragging) return
    const x = clampUnit(saturation / 100)
    const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
    const y = topLightness > 0 ? clampUnit(1 - lightness / topLightness) : 0
    setPositionX(x)
    setPositionY(y)
  }, [saturation, lightness, isDragging])

  const backgroundGradient = useMemo(() => {
    return `linear-gradient(0deg, rgba(0,0,0,1), rgba(0,0,0,0)),
            linear-gradient(90deg, rgba(255,255,255,1), rgba(255,255,255,0)),
            hsl(${hue}, 100%, 50%)`
  }, [hue])

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      if (!(isDragging && containerRef.current)) {
        return
      }
      const rect = containerRef.current.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
      setPositionX(x)
      setPositionY(y)
      setSaturation(x * 100)
      const topLightness = x < 0.01 ? 100 : 50 + 50 * (1 - x)
      const lightness = topLightness * (1 - y)

      setLightness(lightness)
    },
    [isDragging, setSaturation, setLightness],
  )

  useEffect(() => {
    const handlePointerUp = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerUp)
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [isDragging, handlePointerMove])

  return (
    <div
      className={cn("relative size-full cursor-crosshair rounded", className)}
      onPointerDown={e => {
        e.preventDefault()
        setIsDragging(true)
        handlePointerMove(e.nativeEvent)
      }}
      ref={containerRef}
      style={{
        background: backgroundGradient,
      }}
      {...(props as any)}
    >
      <div
        className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute h-4 w-4 rounded-full border-2 border-white"
        style={{
          left: `${positionX * 100}%`,
          top: `${positionY * 100}%`,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  )
})

ColorPickerSelection.displayName = "ColorPickerSelection"

export type ColorPickerHueProps = ComponentProps<typeof Slider.Root>

export const ColorPickerHue = ({ className, ...props }: ColorPickerHueProps) => {
  const { hue, setHue } = useColorPicker()

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={360}
      onValueChange={([hue]) => setHue(hue)}
      step={1}
      value={[hue]}
      {...(props as any)}
    >
      <Slider.Track className="relative my-0.5 h-3 w-full grow rounded-full bg-[linear-gradient(90deg,#FF0000,#FFFF00,#00FF00,#00FFFF,#0000FF,#FF00FF,#FF0000)]">
        <Slider.Range className="absolute h-full" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerAlphaProps = ComponentProps<typeof Slider.Root>

export const ColorPickerAlpha = ({ className, ...props }: ColorPickerAlphaProps) => {
  const { alpha, setAlpha } = useColorPicker()

  return (
    <Slider.Root
      className={cn("relative flex h-4 w-full touch-none", className)}
      max={100}
      onValueChange={([alpha]) => setAlpha(alpha)}
      step={1}
      value={[alpha]}
      {...(props as any)}
    >
      <Slider.Track
        className="relative my-0.5 h-3 w-full grow rounded-full"
        style={{
          background:
            'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVQ4T2NkYGAQYcAP3uCTZhw1gGGYhAGBZIA/nYDCgBDAm9BGDWAAJyRCgLaBCAAgXwixzAS0pgAAAABJRU5ErkJggg==") left center',
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-transparent to-black/50" />
        <Slider.Range className="absolute h-full rounded-full bg-transparent" />
      </Slider.Track>
      <Slider.Thumb className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Root>
  )
}

export type ColorPickerEyeDropperProps = ComponentProps<typeof Button>

export const ColorPickerEyeDropper = ({ className, ...props }: ColorPickerEyeDropperProps) => {
  const { setHue, setSaturation, setLightness, setAlpha } = useColorPicker()

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error - EyeDropper API is experimental
      const eyeDropper = new EyeDropper()
      const result = await eyeDropper.open()
      const color = Color(result.sRGBHex)
      const [h, s, l] = color.hsl().array()

      setHue(h)
      setSaturation(s)
      setLightness(l)
      setAlpha(100)
    } catch (error) {
      console.error("EyeDropper failed:", error)
    }
  }

  return (
    <Button
      className={cn("shrink-0 text-muted-foreground", className)}
      onClick={handleEyeDropper}
      size="icon"
      type="button"
      variant="outline"
      {...(props as any)}
    >
      <PipetteIcon size={16} />
    </Button>
  )
}

export type ColorPickerOutputProps = ComponentProps<typeof SelectTrigger>

const formats = ["hex", "rgb", "css", "hsl"]

export const ColorPickerOutput = ({ className, ...props }: ColorPickerOutputProps) => {
  const { mode, setMode } = useColorPicker()

  return (
    <Select onValueChange={setMode} value={mode}>
      <SelectTrigger className={cn("h-8 w-20 shrink-0 text-xs", className)} {...(props as any)}>
        <SelectValue placeholder="Mode" />
      </SelectTrigger>
      <SelectContent className={cn(className)}>
        {formats.map(format => (
          <SelectItem className={cn("text-xs", className)} key={format} value={format}>
            {format.toUpperCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Input testuale EDITABILE con buffer locale: mentre ha il focus mostra ciò che
// l'utente sta digitando (così può scrivere anche valori parziali/non validi);
// quando perde il focus torna a mostrare il valore canonico ricalcolato dal
// colore. `onCommit` riceve il testo e prova ad applicarlo (gli input non validi
// vengono semplicemente ignorati da chi lo usa).
type ColorInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string | number
  onCommit: (value: string) => void
}

const ColorInput = ({ value, onCommit, className, ...props }: ColorInputProps) => {
  const [focused, setFocused] = useState(false)
  const [local, setLocal] = useState(String(value))

  useEffect(() => {
    if (!focused) setLocal(String(value))
  }, [value, focused])

  return (
    <Input
      type="text"
      value={focused ? local : String(value)}
      onFocus={() => {
        setFocused(true)
        setLocal(String(value))
      }}
      onBlur={() => setFocused(false)}
      onChange={e => {
        setLocal(e.target.value)
        onCommit(e.target.value)
      }}
      className={cn("h-8 bg-secondary px-2 text-xs shadow-none", className)}
      {...(props as any)}
    />
  )
}

const PercentageInput = ({
  value, onCommit, className,
}: {
  value: number
  onCommit: (value: string) => void
  className?: string
}) => {
  return (
    <div className="relative">
      <ColorInput
        value={Math.round(value)}
        onCommit={onCommit}
        className={cn("w-[3.25rem] rounded-l-none", className)}
      />
      <span className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground text-xs">
        %
      </span>
    </div>
  )
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

export type ColorPickerFormatProps = HTMLAttributes<HTMLDivElement>

export const ColorPickerFormat = ({ className, ...props }: ColorPickerFormatProps) => {
  const { hue, saturation, lightness, alpha, mode, enableAlpha, setHue, setSaturation, setLightness, setAlpha } =
    useColorPicker()
  const color = Color.hsl(hue, saturation, lightness, alpha / 100)

  // Applica un colore (di qualunque origine) aggiornando hue/saturation/lightness.
  const setFromColor = (next: ReturnType<typeof Color>) => {
    const [h, s, l] = next.hsl().array()
    setHue(Number.isNaN(h) ? hue : h)
    setSaturation(s)
    setLightness(l)
  }
  const commitAlpha = (text: string) => {
    const n = Number.parseFloat(text)
    if (!Number.isNaN(n)) setAlpha(clamp(n, 0, 100))
  }

  if (mode === "hex") {
    const hex = color.hex()
    const commitHex = (text: string) => {
      const v = text.startsWith("#") ? text : `#${text}`
      try { setFromColor(Color(v)) } catch { /* hex incompleto: ignora */ }
    }
    return (
      <div
        className={cn("-space-x-px relative flex w-full items-center rounded-md shadow-sm", className)}
        {...(props as any)}
      >
        <ColorInput
          value={hex}
          onCommit={commitHex}
          maxLength={enableAlpha ? 9 : 7}
          className={cn(enableAlpha && "rounded-r-none")}
        />
        {enableAlpha && <PercentageInput value={alpha} onCommit={commitAlpha} />}
      </div>
    )
  }

  if (mode === "rgb") {
    const rgb = color.rgb().array().map(v => Math.round(v))
    const commitChannel = (index: number) => (text: string) => {
      const n = Number.parseInt(text, 10)
      if (Number.isNaN(n)) return
      const next = [...rgb]
      next[index] = clamp(n, 0, 255)
      try { setFromColor(Color.rgb(next)) } catch { /* ignora */ }
    }
    return (
      <div className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)} {...(props as any)}>
        {rgb.map((value, index) => (
          <ColorInput
            key={index}
            value={value}
            onCommit={commitChannel(index)}
            className={cn(
              index === 0 && "rounded-r-none",
              index === 1 && "rounded-none",
              enableAlpha && index === 2 && "rounded-none",
              !enableAlpha && index === 2 && "rounded-l-none",
            )}
          />
        ))}
        {enableAlpha && <PercentageInput value={alpha} onCommit={commitAlpha} />}
      </div>
    )
  }

  if (mode === "css") {
    const rgb = color.rgb().array().map(v => Math.round(v))
    const css = enableAlpha ? `rgba(${rgb.join(", ")}, ${(alpha / 100).toFixed(2)})` : `rgb(${rgb.join(", ")})`
    const commitCss = (text: string) => {
      try { setFromColor(Color(text)) } catch { /* ignora */ }
    }
    return (
      <div className={cn("w-full rounded-md shadow-sm", className)} {...(props as any)}>
        <ColorInput value={css} onCommit={commitCss} className="w-full" />
      </div>
    )
  }

  if (mode === "hsl") {
    const hsl = color.hsl().array().map(v => Math.round(v))
    const setters = [
      (n: number) => setHue(clamp(n, 0, 360)),
      (n: number) => setSaturation(clamp(n, 0, 100)),
      (n: number) => setLightness(clamp(n, 0, 100)),
    ]
    const commitChannel = (index: number) => (text: string) => {
      const n = Number.parseInt(text, 10)
      if (!Number.isNaN(n)) setters[index](n)
    }
    return (
      <div className={cn("-space-x-px flex items-center rounded-md shadow-sm", className)} {...(props as any)}>
        {hsl.map((value, index) => (
          <ColorInput
            key={index}
            value={value}
            onCommit={commitChannel(index)}
            className={cn(
              index === 0 && "rounded-r-none",
              index === 1 && "rounded-none",
              enableAlpha && index === 2 && "rounded-none",
              !enableAlpha && index === 2 && "rounded-l-none",
            )}
          />
        ))}
        {enableAlpha && <PercentageInput value={alpha} onCommit={commitAlpha} />}
      </div>
    )
  }

  return null
}

// Demo
export function DemoPicker() {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-8">
      <ColorPicker defaultValue="#6366f1" className="h-auto w-64">
        <ColorPickerSelection className="h-40 rounded-lg" />
        <ColorPickerHue />
        <ColorPickerAlpha />
        <div className="flex items-center gap-2">
          <ColorPickerEyeDropper />
          <ColorPickerOutput />
          <ColorPickerFormat />
        </div>
      </ColorPicker>
    </div>
  )
}
