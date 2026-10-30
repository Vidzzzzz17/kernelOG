"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import useSWR, { mutate as mutateCache } from "swr"
import { LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KernelChatModal } from "@/components/kernel-chat-modal"

type Conversation = {
  conversationId: string
  title: string
  updatedAt: string
  messageCount: number
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

type ConversationList = { conversations: Conversation[] }
type ConversationMessages = { messages: ChatMessage[] }
type StreamEvent =
  | { type: "meta"; conversationId: string }
  | { type: "token"; content: string }
  | { type: "done"; conversationId: string }
  | { type: "error"; message: string }
type LiveConversation = { conversationId: string; pending: boolean; messages: ChatMessage[] }

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.")
  return payload as T
}

export function KernelChat() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [requestError, setRequestError] = useState("")
  const [liveConversation, setLiveConversation] = useState<LiveConversation | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState("")
  const initializedConversation = useRef(false)
  const requestController = useRef<AbortController | null>(null)
  const activeConversationRef = useRef<string | null>(null)

  const {
    data: conversationData,
    error: conversationError,
    isLoading: conversationsLoading,
    mutate: refreshConversations,
  } = useSWR<ConversationList>("/api/conversations", fetcher, { revalidateOnFocus: true })
  const transcriptKey = activeConversationId
    ? `/api/conversations/${activeConversationId}`
    : null
  const { data: transcriptData } = useSWR<ConversationMessages>(transcriptKey, fetcher)

  useEffect(() => {
    activeConversationRef.current = activeConversationId
  }, [activeConversationId])

  useEffect(() => {
    if (initializedConversation.current || !conversationData) return
    initializedConversation.current = true
    const latestConversation = conversationData.conversations[0]
    if (latestConversation) {
      activeConversationRef.current = latestConversation.conversationId
      setActiveConversationId(latestConversation.conversationId)
    }
  }, [conversationData])

  useEffect(() => () => requestController.current?.abort(), [])

  const visibleMessages =
    liveConversation &&
    ((liveConversation.pending && activeConversationId === null) ||
      liveConversation.conversationId === activeConversationId)
      ? liveConversation.messages
      : transcriptData?.messages ?? []

  function startNewConversation() {
    requestController.current?.abort()
    requestController.current = null
    initializedConversation.current = true
    activeConversationRef.current = null
    setActiveConversationId(null)
    setLiveConversation(null)
    setRequestError("")
    setDraft("")
    setIsSending(false)
  }

  function openConversation(conversationId: string) {
    requestController.current?.abort()
    requestController.current = null
    initializedConversation.current = true
    activeConversationRef.current = conversationId
    setActiveConversationId(conversationId)
    setLiveConversation(null)
    setRequestError("")
    setDraft("")
    setIsSending(false)
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => setCopiedMessageId(""), 1_500)
    } catch {
      setRequestError("The browser could not copy this response.")
    }
  }

  async function submitMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || isSending) return

    const isNewConversation = activeConversationId === null
    const conversationId = activeConversationId ?? crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const baseMessages = isNewConversation ? [] : visibleMessages
    const optimisticMessages: ChatMessage[] = [
      ...baseMessages,
      { id: crypto.randomUUID(), role: "user", content, createdAt },
      { id: assistantId, role: "assistant", content: "", createdAt },
    ]
    const controller = new AbortController()
    requestController.current = controller
    setLiveConversation({ conversationId, pending: isNewConversation, messages: optimisticMessages })
    setRequestError("")
    setDraft("")
    setIsSending(true)

    let assistantContent = ""
    let completed = false

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          newConversation: isNewConversation,
          message: content,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "Kernel could not answer this message.")
      }
      if (!response.body) throw new Error("The response stream was unavailable.")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const handleEvent = (rawEvent: string) => {
        const dataLine = rawEvent.split(/\r?\n/).find((line) => line.startsWith("data:"))
        if (!dataLine) return
        const data = JSON.parse(dataLine.slice(5).trim()) as StreamEvent

        if (data.type === "meta") {
          if (requestController.current === controller) {
            activeConversationRef.current = data.conversationId
            setActiveConversationId(data.conversationId)
            setLiveConversation((current) =>
              current?.conversationId === data.conversationId
                ? { ...current, pending: false }
                : current,
            )
          }
        } else if (data.type === "token") {
          assistantContent += data.content
          setLiveConversation((current) =>
            current?.conversationId === conversationId
              ? {
                  ...current,
                  messages: current.messages.map((message) =>
                    message.id === assistantId ? { ...message, content: assistantContent } : message,
                  ),
                }
              : current,
          )
        } else if (data.type === "done") {
          completed = true
        } else if (data.type === "error") {
          throw new Error(data.message)
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
          const events = buffer.split(/\r?\n\r?\n/)
          buffer = events.pop() ?? ""
          for (const eventChunk of events) handleEvent(eventChunk)
          if (done) break
        }
        if (buffer.trim()) handleEvent(buffer)
      } finally {
        reader.releaseLock()
      }

      if (!completed) throw new Error("Kernel's response ended before it was complete.")

      await mutateCache(`/api/conversations/${conversationId}`)
      await refreshConversations()
      setLiveConversation((current) =>
        current?.conversationId === conversationId ? null : current,
      )
    } catch (error) {
      if (!controller.signal.aborted) {
        setRequestError(error instanceof Error ? error.message : "Kernel could not answer this message.")
      }
    } finally {
      if (requestController.current === controller) requestController.current = null
      setIsSending(false)
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      event.preventDefault()
      void submitMessage()
    }
  }

  return (
    <main className="relative isolate h-[100dvh] min-h-[520px] w-full overflow-hidden bg-white">
      <iframe
        name="kernel-design-canvas"
        title="Kernel design pages"
        src="/kernel-design-export/standalone/Main.html"
        sandbox="allow-forms allow-popups allow-same-origin"
        className="absolute inset-0 size-full border-0"
      />
      <a
        href="/kernel-design-export/standalone/index.html"
        target="kernel-design-canvas"
        className="fixed bottom-6 left-6 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#C7C7C7] bg-white/95 px-4 text-sm font-medium text-[#000] shadow-[0_8px_28px_rgba(0,0,0,.12)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#929292] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C15F3C] focus-visible:ring-offset-2"
      >
        <LayoutGrid aria-hidden="true" className="size-4" />
        All screens
      </a>
      <KernelChatModal
        messages={visibleMessages}
        conversations={conversationData?.conversations ?? []}
        activeConversationId={activeConversationId}
        historyError={conversationError?.message ?? ""}
        historyLoading={conversationsLoading}
        draft={draft}
        isSending={isSending}
        canSend
        requestError={requestError}
        copiedMessageId={copiedMessageId}
        onDraftChange={setDraft}
        onSubmit={(event) => void submitMessage(event)}
        onKeyDown={handleComposerKeyDown}
        onCopy={(message) => void copyMessage(message)}
        onStartNewConversation={startNewConversation}
        onOpenConversation={openConversation}
      />
    </main>
  )
}
