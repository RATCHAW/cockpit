import { Button } from "@cockpit/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@cockpit/ui/components/dialog"
import { Input } from "@cockpit/ui/components/input"
import { Skeleton } from "@cockpit/ui/components/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cockpit/ui/components/tabs"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import {
  categoriesQueryOptions,
  financeKey,
  TRANSACTION_KINDS,
  type Category,
  type TransactionKind,
} from "~/lib/finance"

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(40, "Keep it under 40 characters."),
})

const errorBodySchema = z.object({ error: z.string() })

class NameTakenError extends Error {}

export function CategoryManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setRenaming(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        onInteractOutside={(e) => {
          if (e.target instanceof Element && e.target.closest("[data-sonner-toaster]")) {
            e.preventDefault()
          }
        }}
        onEscapeKeyDown={(e) => {
          if (renaming) {
            e.preventDefault()
            setRenaming(null)
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>
            Renaming a category also renames the transactions already filed under it. Removing one
            keeps it on past transactions.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="expense" onValueChange={() => setRenaming(null)} className="gap-5">
          <TabsList className="w-full" aria-label="Type">
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
          {TRANSACTION_KINDS.map((kind) => (
            <TabsContent key={kind} value={kind} className="grid gap-4">
              <AddCategory kind={kind} />
              <CategoryList kind={kind} renaming={renaming} onRename={setRenaming} />
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function AddCategory({ kind }: { kind: TransactionKind }) {
  return (
    <NameForm
      initial=""
      ariaLabel={`New ${kind} category`}
      placeholder="New category"
      save={(name) => api.finance.categories.$post({ json: { kind, name } })}
    >
      {(pending) => (
        <Button type="submit" variant="secondary" disabled={pending}>
          Add
        </Button>
      )}
    </NameForm>
  )
}

function CategoryList({
  kind,
  renaming,
  onRename,
}: {
  kind: TransactionKind
  renaming: string | null
  onRename: (id: string | null) => void
}) {
  const categories = useQuery(categoriesQueryOptions)

  if (!categories.data) {
    return categories.isError ? (
      <p className="text-body-sm text-negative-darkest">
        Couldn't load your categories. Try again in a moment.
      </p>
    ) : (
      <div className="grid gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 bg-canvas-soft" />
        ))}
      </div>
    )
  }

  const items = categories.data.items.filter((c) => c.kind === kind)
  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-canvas-soft p-4 text-body-sm text-body">
        No {kind} categories yet.
      </p>
    )
  }

  return (
    <ul className="-mx-3 grid">
      {items.map((category) => (
        <CategoryRow
          key={category.id}
          category={category}
          renaming={renaming === category.id}
          onRenamingChange={(on) => onRename(on ? category.id : null)}
        />
      ))}
    </ul>
  )
}

function CategoryRow({
  category,
  renaming,
  onRenamingChange,
}: {
  category: Category
  renaming: boolean
  onRenamingChange: (renaming: boolean) => void
}) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKey })
  const renameButton = useRef<HTMLButtonElement>(null)
  const wasRenaming = useRef(renaming)

  useEffect(() => {
    if (wasRenaming.current && !renaming) renameButton.current?.focus()
    wasRenaming.current = renaming
  }, [renaming])

  const remove = useMutation({
    mutationFn: () =>
      parseResponse(api.finance.categories[":id"].$delete({ param: { id: category.id } })),
    onSuccess: async () => {
      await refresh()
      toast("Category removed", {
        description: `${category.name} stays on past transactions.`,
        // The open dialog turns off pointer events everywhere else on the page.
        className: "pointer-events-auto",
        action: {
          label: "Undo",
          onClick: async () => {
            const { kind, name } = category
            await parseResponse(api.finance.categories.$post({ json: { kind, name } })).catch(() =>
              toast.error("Couldn't restore it. Add it again manually."),
            )
            await refresh()
          },
        },
      })
    },
    onError: () => toast.error("Couldn't remove it. Try again."),
  })

  if (renaming) {
    return (
      <li className="py-1 pr-1 pl-3">
        <NameForm
          initial={category.name}
          ariaLabel={`New name for ${category.name}`}
          inputClassName="h-10"
          autoFocus
          save={(name) =>
            api.finance.categories[":id"].$patch({ param: { id: category.id }, json: { name } })
          }
          onSaved={() => onRenamingChange(false)}
        >
          {(pending) => (
            <>
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label="Save name"
              >
                <CheckIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pending}
                aria-label="Cancel renaming"
                onClick={() => onRenamingChange(false)}
              >
                <XIcon />
              </Button>
            </>
          )}
        </NameForm>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-1 py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate text-body-md font-semibold">{category.name}</span>
      <Button
        ref={renameButton}
        variant="ghost"
        size="icon-sm"
        disabled={remove.isPending}
        aria-label={`Rename ${category.name}`}
        onClick={() => onRenamingChange(true)}
      >
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-negative-darkest"
        disabled={remove.isPending}
        aria-label={`Remove ${category.name}`}
        onClick={() => remove.mutate()}
      >
        <Trash2Icon />
      </Button>
    </li>
  )
}

function NameForm({
  initial,
  ariaLabel,
  placeholder,
  inputClassName,
  autoFocus,
  save,
  onSaved,
  children,
}: {
  initial: string
  ariaLabel: string
  placeholder?: string
  inputClassName?: string
  autoFocus?: boolean
  save: (name: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  onSaved?: () => void
  children: (pending: boolean) => ReactNode
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await save(name)
      if (res.status === 409) {
        throw new NameTakenError(errorBodySchema.parse(await res.json()).error)
      }
      if (!res.ok) throw new Error(`Saving the category failed with ${res.status}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeKey })
      form.reset()
      onSaved?.()
    },
  })

  const form = useAppForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: nameSchema },
    onSubmit: ({ value }) => {
      const name = value.name.trim()
      if (name === initial) onSaved?.()
      else mutation.mutate(name)
    },
  })

  return (
    <form
      noValidate
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => {
          const invalid = field.state.meta.errors[0] as { message?: string } | string | undefined
          const error =
            (typeof invalid === "string" ? invalid : invalid?.message) ??
            (mutation.error instanceof NameTakenError
              ? mutation.error.message
              : mutation.error
                ? "Couldn't save that. Try again."
                : undefined)
          return (
            <>
              <div className="flex items-center gap-2">
                <Input
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value)
                    mutation.reset()
                  }}
                  onBlur={field.handleBlur}
                  // Read-only rather than disabled, so a failed save leaves focus in the input.
                  readOnly={mutation.isPending}
                  placeholder={placeholder}
                  autoComplete="off"
                  autoFocus={autoFocus}
                  aria-label={ariaLabel}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  className={inputClassName}
                />
                {children(mutation.isPending)}
              </div>
              {error ? (
                <p id={`${id}-error`} className="text-body-sm text-negative-darkest">
                  {error}
                </p>
              ) : null}
            </>
          )
        }}
      </form.Field>
    </form>
  )
}
