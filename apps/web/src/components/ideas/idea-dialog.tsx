import { IDEA_MAX_LENGTH } from "@cockpit/api/ideas"
import { Button } from "@cockpit/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cockpit/ui/components/dialog"
import { revalidateLogic } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { parseResponse } from "hono/client"
import { LightbulbIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { z } from "zod"

import { FormAlert } from "~/components/form-alert"
import { useAppForm } from "~/hooks/form"
import { api } from "~/lib/api"
import { ideasQueryOptions, type Idea } from "~/lib/ideas"

const formSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write down your idea first.")
    .max(IDEA_MAX_LENGTH, "Keep it under 5,000 characters."),
})

export function CaptureIdeaButton() {
  const [open, setOpen] = useState(false)
  return (
    <IdeaDialog
      open={open}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      trigger={
        <Button size="sm">
          <LightbulbIcon />
          Capture idea
        </Button>
      }
    />
  )
}

export function IdeaDialog({
  open,
  onClose,
  onOpen,
  idea,
  trigger,
}: {
  open: boolean
  onClose: () => void
  onOpen?: () => void
  idea?: Idea
  trigger?: ReactNode
}) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (content: string) =>
      idea
        ? parseResponse(api.ideas[":id"].$patch({ param: { id: idea.id }, json: { content } }))
        : parseResponse(api.ideas.$post({ json: { content } })),
    onSuccess: (saved) => {
      queryClient.setQueryData(ideasQueryOptions.queryKey, (data) =>
        data
          ? {
              items: idea
                ? data.items.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...data.items],
            }
          : undefined,
      )
      void queryClient.invalidateQueries({ queryKey: ideasQueryOptions.queryKey })
    },
  })

  // The form lives outside DialogContent so dismissing quick capture keeps the draft.
  const form = useAppForm({
    defaultValues: { content: idea?.content ?? "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(value.content.trim())
      } catch {
        return
      }
      toast.success(idea ? "Idea updated" : "Idea saved")
      if (!idea) form.reset()
      onClose()
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (save.isPending) return
        if (next) onOpen?.()
        else onClose()
      }}
    >
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={!save.isPending}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>{idea ? "Edit idea" : "Catch that thought"}</DialogTitle>
          <DialogDescription>
            {idea ? "Give your idea a little more shape." : "Get it down now. Figure it out later."}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key === "Enter" &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              if (!save.isPending) void form.handleSubmit()
            }
          }}
        >
          {save.error ? (
            <FormAlert>Couldn't save your idea. Your text is still here. Try again.</FormAlert>
          ) : null}
          <form.AppField name="content">
            {(field) => (
              <field.TextareaField
                label="Your idea"
                placeholder="What if…"
                autoFocus
                rows={7}
                maxLength={IDEA_MAX_LENGTH}
                disabled={save.isPending}
                className="max-h-[45dvh] min-h-40 resize-y"
              />
            )}
          </form.AppField>
          <DialogFooter className="gap-3 sm:items-center sm:justify-between">
            <p className="text-caption text-mute">⌘ / Ctrl + Enter to save</p>
            <form.AppForm>
              <form.SubmitButton
                pendingLabel="Saving…"
                pending={save.isPending}
                className="sm:w-auto"
              >
                {idea ? "Save changes" : "Save idea"}
              </form.SubmitButton>
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
