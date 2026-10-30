"use client"

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import useSWR, { mutate as mutateCache } from "swr"
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Menu,
  MessageSquareText,
  Plus,
  Server,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Bubble,
  BubbleContent,
} from "@/components/ui/bubble"
import {
  Message,
  MessageContent,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

type Model = { name: string; size?: number; parameterSize?: string }
type ModelStatus = { connected: boolean; models: Model[]; error?: string }
type Conversation = { conversationId: string; title: string; updatedAt: string; messageCount: number }
type Role = "user" | "assistant"
type ChatMessage = { id: string; role: Role; content: string; createdAt: string }
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

const suggestions = [
  "Explain a difficult idea in simple terms",
  "Help me write a clear, thoughtful email",
  "Plan a focused week around my priorities",
  "Review this code and suggest improvements",
]

export function KernelChat() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState("")
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [requestError, setRequestError] = useState("")
  const [liveConversation, setLiveConversation] = useState<LiveConversation | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState("")
  const initializedConversation = useRef(false)
  const activeConversationRef = useRef<string | null>(null)
  const requestController = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: modelStatus, isLoading: modelsLoading, mutate: refreshModels } = useSWR<ModelStatus>(
    "/api/models",
    fetcher,
    { refreshInterval: 8_000, revalidateOnFocus: true },
  )
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
    try {
      const savedModel = window.localStorage.getItem("kernel-model")
      if (savedModel) setSelectedModel(savedModel)
    } catch {
      setSelectedModel("")
    }
  }, [])

  useEffect(() => {
    if (!modelStatus?.models.length) return
    setSelectedModel((current) => {
      const next = modelStatus.models.some((model) => model.name === current)
        ? current
        : modelStatus.models[0].name
      try {
        window.localStorage.setItem("kernel-model", next)
      } catch {
        return next
      }
      return next
    })
  }, [modelStatus])

  useEffect(() => {
    if (initializedConversation.current || !conversationData) return
    initializedConversation.current = true
    const latestConversation = conversationData.conversations[0]
    if (latestConversation) {
      activeConversationRef.current = latestConversation.conversationId
      setActiveConversationId(latestConversation.conversationId)
    }
  }, [conversationData])

  const visibleMessages =
    liveConversation &&
    ((liveConversation.pending && activeConversationId === null) ||
      liveConversation.conversationId === activeConversationId)
      ? liveConversation.messages
      : transcriptData?.messages ?? []

  function startNewChat() {
    requestController.current?.abort()
    requestController.current = null
    initializedConversation.current = true
    activeConversationRef.current = null
    setActiveConversationId(null)
    setLiveConversation(null)
    setRequestError("")
    setDraft("")
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }

  function openConversation(conversationId: string) {
    requestController.current?.abort()
    requestController.current = null
    initializedConversation.current = true
    activeConversationRef.current = conversationId
    setActiveConversationId(conversationId)
    setLiveConversation(null)
    setRequestError("")
    setSidebarOpen(false)
  }

  function chooseModel(model: string) {
    setSelectedModel(model)
    try {
      window.localStorage.setItem("kernel-model", model)
    } catch {
      return
    }
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
    if (!content || !selectedModel || isSending || !modelStatus?.connected) return

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
          model: selectedModel,
          message: content,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || "The model could not answer this message.")
      }
      if (!response.body) throw new Error("The model response stream was unavailable.")

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

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
        const events = buffer.split(/\r?\n\r?\n/)
        buffer = events.pop() ?? ""
        for (const eventChunk of events) handleEvent(eventChunk)
        if (done) break
      }
      if (buffer.trim()) handleEvent(buffer)
      if (!completed) throw new Error("The model response ended before it was complete.")

      await mutateCache(`/api/conversations/${conversationId}`)
      await refreshConversations()
      setLiveConversation((current) =>
        current?.conversationId === conversationId ? null : current,
      )
    } catch (error) {
      if (!controller.signal.aborted) {
        setRequestError(error instanceof Error ? error.message : "The model could not answer this message.")
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

  const connectionLabel = modelsLoading
    ? "Checking Ollama"
    : modelStatus?.connected
      ? modelStatus.models.length > 0
        ? `${modelStatus.models.length} model${modelStatus.models.length === 1 ? "" : "s"} ready`
        : "No models installed"
      : "Ollama offline"

  return (
    <div className="flex h-svh min-h-[520px] bg-background text-foreground">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close chat history"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        aria-label="Chat history"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-5 pt-5">
          <a href="/" className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              <img src="/kernel/assets/kernel-logo.png" alt="" className="size-6 object-contain" />
            </span>
            <span>Kernel</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Start a new chat"
            onClick={startNewChat}
          >
            <Plus data-icon="inline-start" />
          </Button>
        </div>

        <div className="px-3">
          <Button type="button" className="w-full justify-start" onClick={startNewChat}>
            <Plus data-icon="inline-start" />
            New chat
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-3 pt-7">
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="text-xs font-medium text-muted-foreground">Recent chats</h2>
            {conversationsLoading && <span className="text-xs text-muted-foreground">Loading</span>}
          </div>
          {conversationError ? (
            <p role="alert" className="px-2 py-3 text-xs text-destructive">
              {conversationError.message}
            </p>
          ) : (
            <nav aria-label="Recent conversations" className="min-h-0 flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-1">
                {(conversationData?.conversations ?? []).map((conversation) => (
                  <li key={conversation.conversationId}>
                    <button
                      type="button"
                      title={conversation.title}
                      aria-current={activeConversationId === conversation.conversationId ? "page" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        activeConversationId === conversation.conversationId && "bg-sidebar-accent font-medium",
                      )}
                      onClick={() => openConversation(conversation.conversationId)}
                    >
                      <MessageSquareText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{conversation.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {!conversationsLoading && conversationData?.conversations.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">Your chats will appear here.</p>
              )}
            </nav>
          )}
        </div>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className={cn("size-2 rounded-full", modelStatus?.connected ? "bg-emerald-500" : "bg-amber-500")} />
            <span>{connectionLabel}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Chat history is saved in the database configured for this Kernel instance.
          </p>
          <a href="/kernel/Main.html" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Kernel website <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open chat history"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu data-icon="inline-start" />
            </Button>
            <div className="relative flex min-w-0 items-center">
              <label htmlFor="model-select" className="sr-only">Choose a local model</label>
              <select
                id="model-select"
                value={selectedModel}
                onChange={(event) => chooseModel(event.target.value)}
                disabled={!modelStatus?.models.length}
                className="max-w-[180px] appearance-none truncate rounded-lg border border-transparent bg-transparent py-2 pl-2 pr-8 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground sm:max-w-[240px]"
              >
                {modelStatus?.models.length ? (
                  modelStatus.models.map((model) => <option key={model.name} value={model.name}>{model.name}</option>)
                ) : (
                  <option value="">No local models</option>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", modelStatus?.connected ? "bg-emerald-500" : "bg-amber-500")} aria-hidden="true" />
            <span className="hidden text-xs text-muted-foreground sm:inline" role="status" aria-live="polite">{connectionLabel}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => void refreshModels()}
            >
              Refresh
            </Button>
          </div>
        </header>

        {modelStatus && (!modelStatus.connected || modelStatus.models.length === 0) && (
          <section className="mx-4 mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/50 p-4 sm:mx-6" aria-live="polite">
            <Server className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {modelStatus.connected ? "Ollama is ready, but no models are installed" : "Connect Ollama to start chatting"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Run Ollama on the same server as this app, then install a model. Kernel discovers installed models automatically.
                {modelStatus.error ? ` ${modelStatus.error}` : ""}
              </p>
            </div>
            <a
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium underline underline-offset-4"
            >
              Get Ollama <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </section>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          {visibleMessages.length > 0 ? (
            <MessageScrollerProvider>
              <MessageScroller className="flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 pb-8 pt-8 sm:px-8">
                    <MessageGroup>
                      {visibleMessages.map((message, index) => (
                        <MessageScrollerItem
                          key={message.id}
                          scrollAnchor={index === visibleMessages.length - 1}
                        >
                          <Message align={message.role === "user" ? "end" : "start"}>
                            <MessageContent className="max-w-[88%] gap-1.5">
                              <MessageHeader className={cn("px-1", message.role === "user" && "justify-end")}>
                                {message.role === "user" ? "You" : "Kernel"}
                              </MessageHeader>
                              <Bubble
                                align={message.role === "user" ? "end" : "start"}
                                variant={message.role === "user" ? "secondary" : "ghost"}
                                className="max-w-full"
                              >
                                <BubbleContent className="px-3 py-2.5 text-[15px] leading-7">
                                  {message.content ? (
                                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                  ) : isSending && message.role === "assistant" ? (
                                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                      <span className="size-1.5 animate-pulse rounded-full bg-current" />
                                      Thinking
                                    </span>
                                  ) : null}
                                </BubbleContent>
                              </Bubble>
                              {message.role === "assistant" && message.content && !isSending && (
                                <div className="flex px-1 pt-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Copy response"
                                    onClick={() => void copyMessage(message)}
                                  >
                                    {copiedMessageId === message.id ? <Check data-icon="inline-start" /> : <span className="text-xs">Copy</span>}
                                  </Button>
                                </div>
                              )}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      ))}
                    </MessageGroup>
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton aria-label="Scroll to latest message" />
              </MessageScroller>
            </MessageScrollerProvider>
          ) : (
            <section className="flex min-h-0 flex-1 flex-col items-center justify-center px-5 py-10 text-center">
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
              </div>
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                What would you like to think through?
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                Chat with an open-source model running on your Ollama server. Your conversations stay with this Kernel instance.
              </p>
              <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    onClick={() => {
                      setDraft(suggestion)
                      textareaRef.current?.focus()
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="shrink-0 px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
            <div className="mx-auto max-w-3xl">
              {requestError && (
                <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {requestError}
                </p>
              )}
              <form onSubmit={(event) => void submitMessage(event)} className="rounded-2xl border border-input bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
                <label htmlFor="chat-input" className="sr-only">Message Kernel</label>
                <textarea
                  id="chat-input"
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={modelStatus?.connected ? "Message your local model…" : "Connect Ollama to begin"}
                  rows={2}
                  maxLength={8_000}
                  disabled={!modelStatus?.connected || !selectedModel || isSending}
                  className="max-h-40 min-h-16 w-full resize-y bg-transparent px-4 pt-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                />
                <div className="flex items-center justify-between gap-3 px-3 pb-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CircleHelp className="size-3.5" aria-hidden="true" />
                    Enter to send · Shift + Enter for a new line
                  </p>
                  <Button
                    type="submit"
                    size="icon"
                    aria-label={isSending ? "Generating response" : "Send message"}
                    disabled={!draft.trim() || !selectedModel || isSending || !modelStatus?.connected}
                  >
                    <ArrowUp data-icon="inline-start" />
                  </Button>
                </div>
              </form>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Prompts are sent to the Ollama server configured for this app.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
