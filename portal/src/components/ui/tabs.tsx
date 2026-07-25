"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        // `data-[orientation=horizontal]` et NON `data-horizontal` : en Tailwind v4, le
        // variant court teste la PRÉSENCE d'un attribut `data-horizontal`, que Base UI ne pose
        // jamais — il pose `data-orientation="horizontal"`. Écrit court, le variant ne matche
        // donc jamais : la racine restait en `flex-row`, la liste d'onglets se plaçait à CÔTÉ
        // du panneau au lieu d'être au-dessus, et le panneau débordait de l'écran.
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  // `max-w-full overflow-x-auto` : les libellés d'onglets sont en français et ne se coupent
  // pas (`whitespace-nowrap`). À 390 px, trois onglets — « Identité », « Position dans
  // l'arbre », « Mouvements de solde » — dépassent la largeur de l'écran et poussaient la
  // page entière. La barre défile maintenant DANS SA PROPRE BOÎTE : tous les onglets restent
  // atteignables et lisibles en entier, et la page ne bouge plus. Même principe que le
  // `min-w-0` du panneau : ce qui est trop large scrolle chez lui, jamais chez son parent.
  "group/tabs-list inline-flex w-fit max-w-full items-center justify-center overflow-x-auto rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pe-1 has-data-[icon=inline-start]:ps-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        // Le trait de l'onglet actif (variante `line`) est ancré au BORD de l'onglet, et non
        // 5 px en dessous : la liste défilant dans sa propre boîte, tout ce qui déborde d'elle
        // serait rogné — le trait aurait disparu.
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-0 group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:end-0 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      // `min-w-0` : un enfant de flex a `min-width: auto` par défaut, donc il refuse de
      // descendre sous la largeur de son contenu. Sans lui, un tableau large impose sa
      // largeur au panneau, qui pousse la page hors de l'écran au lieu de laisser le
      // `overflow-x-auto` du tableau faire son travail.
      className={cn("min-w-0 flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
