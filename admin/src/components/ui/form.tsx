import * as React from "react"
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/**
 * Passerelle react-hook-form ↔ shadcn, portée à la main : le registre `base-nova` utilisé par
 * ce projet (`components.json`) ne publie pas de composant `form`. Le code suit fidèlement le
 * patron shadcn officiel — deux contextes (le champ, son élément de contrôle) d'où découlent
 * les identifiants `aria-*` et le message d'erreur.
 *
 * Ce que ça achète : un champ n'a plus à câbler lui-même `id`, `aria-invalid`,
 * `aria-describedby` ni l'affichage de son erreur. Sur des formulaires denses (un pack a
 * 7 champs, un produit 11), c'est ce câblage répété qui diverge en premier.
 */

const Form = FormProvider

interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null)

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  const value = React.useMemo(() => ({ name: props.name }), [props.name])
  return (
    <FormFieldContext value={value as FormFieldContextValue}>
      <Controller {...props} />
    </FormFieldContext>
  )
}

interface FormItemContextValue {
  id: string
}

const FormItemContext = React.createContext<FormItemContextValue | null>(null)

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const { getFieldState } = useFormContext()
  const formState = useFormState({ name: fieldContext?.name as string })

  if (!fieldContext || !itemContext) {
    throw new Error("useFormField doit être utilisé dans un <FormField><FormItem>")
  }

  const fieldState = getFieldState(fieldContext.name, formState)

  return {
    name: fieldContext.name,
    formItemId: `${itemContext.id}-item`,
    formDescriptionId: `${itemContext.id}-description`,
    formMessageId: `${itemContext.id}-message`,
    ...fieldState,
  }
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId()
  const value = React.useMemo(() => ({ id }), [id])

  return (
    <FormItemContext value={value}>
      <div data-slot="form-item" className={cn("grid gap-2", className)} {...props} />
    </FormItemContext>
  )
}

function FormLabel({ className, ...props }: React.ComponentProps<"label">) {
  const { error, formItemId } = useFormField()

  return (
    <Label
      data-slot="form-label"
      data-error={!!error}
      className={cn("data-[error=true]:text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  )
}

/**
 * `Slot` maison (une poignée de lignes, plutôt qu'une dépendance de plus) : clone l'enfant
 * unique en lui injectant `id` et les `aria-*`. C'est ce qui permet d'écrire
 * `<FormControl><Input …/></FormControl>` sans que l'`Input` connaisse le formulaire.
 */
function FormControl({ children }: { children: React.ReactElement }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()

  return React.cloneElement(
    children as React.ReactElement<Record<string, unknown>>,
    {
      id: formItemId,
      "aria-describedby": error
        ? `${formDescriptionId} ${formMessageId}`
        : formDescriptionId,
      "aria-invalid": !!error,
    },
  )
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField()

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField()
  const body = error ? String(error.message ?? "") : props.children

  if (!body) return null

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  )
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
}
