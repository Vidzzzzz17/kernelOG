"use client"

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Dialog } from "@base-ui/react/dialog"
import {
  ArrowUp,
  Check,
  Clock3,
  Menu,
  MessageSquareText,
  Plus,
  Sparkles,
  X,
} from "lucide-react"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

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

type KernelChatModalProps = {
  messages: ChatMessage[]
  conversations: Conversation[]
  activeConversationId: string | null
  historyError: string
  historyLoading: boolean
  draft: string
  isSending: boolean
  canSend: boolean
  requestError: string
  copiedMessageId: string
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onCopy: (message: ChatMessage) => void
  onStartNewConversation: () => void
  onOpenConversation: (conversationId: string) => void
}

const suggestions = [
  "Explain a difficult idea in simple terms",
  "Help me write a clear, thoughtful email",
  "Plan a focused week around my priorities",
  "Review this code and suggest improvements",
]

function SkiperTextReveal({ text }: { text: string }) {
  const prefersReducedMotion = useReducedMotion()
  const centerIndex = Math.floor(Array.from(text).length / 2)

  return (
    <span className="inline-flex" aria-hidden="true" style={{ perspective: "500px" }}>
      {Array.from(text).map((character, index) => {
        const distanceFromCenter = index - centerIndex

        return (
          <motion.span
            key={`${character}-${index}`}
            className="inline-block whitespace-pre"
            initial={
              prefersReducedMotion
                ? false
                : { opacity: 0, x: distanceFromCenter * 2.5, y: 10, rotateX: distanceFromCenter * 3 }
            }
            animate={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : {
                    type: "spring",
                    stiffness: 220,
                    damping: 24,
                    delay: index * 0.016,
                  }
            }
          >
            {character === " " ? "\u00a0" : character}
          </motion.span>
        )
      })}
    </span>
  )
}

function ConversationHistory({
  conversations,
  activeConversationId,
  error,
  loading,
  onStartNewConversation,
  onOpenConversation,
}: {
  conversations: Conversation[]
  activeConversationId: string | null
  error: string
  loading: boolean
  onStartNewConversation: () => void
  onOpenConversation: (conversationId: string) => void
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#4A4A4A]">Your space</p>
          <h2 className="mt-1 text-sm font-semibold text-[#000]">Recent chats</h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Start a new chat"
          title="Start a new chat"
          onClick={onStartNewConversation}
          className="rounded-full text-[#000] hover:bg-white"
        >
          <Plus data-icon="inline-start" />
        </Button>
      </div>
      <div className="px-3 pb-3">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start border-[#C7C7C7] bg-white text-[#000] hover:bg-[#F7E6DF]"
          onClick={onStartNewConversation}
        >
          <Plus data-icon="inline-start" />
          New conversation
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {error ? (
          <p role="alert" className="px-2 py-3 text-xs leading-relaxed text-destructive">
            {error}
          </p>
        ) : loading ? (
          <p className="px-2 py-3 text-xs text-[#4A4A4A]">Loading chats…</p>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-relaxed text-[#4A4A4A]">
            Your conversations will appear here.
          </p>
        ) : (
          <nav aria-label="Recent conversations">
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => (
                <li key={conversation.conversationId}>
                  <button
                    type="button"
                    title={conversation.title}
                    aria-current={activeConversationId === conversation.conversationId ? "page" : undefined}
                    onClick={() => onOpenConversation(conversation.conversationId)}
                    className={cn(
                      "flex w-full min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#262626] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C15F3C]",
                      activeConversationId === conversation.conversationId && "bg-white font-medium text-[#000] shadow-sm",
                    )}
                  >
                    <MessageSquareText className="size-4 shrink-0 text-[#4A4A4A]" aria-hidden="true" />
                    <span className="truncate">{conversation.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="border-t border-[#DADADA] px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-[#4A4A4A]">
          <span className="size-2 rounded-full bg-[#193A29]" aria-hidden="true" />
          Ready to help
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-[#5E5E5E]">
          Conversations stay with this Kernel instance.
        </p>
      </div>
    </>
  )
}

export function KernelChatModal({
  messages,
  conversations,
  activeConversationId,
  historyError,
  historyLoading,
  draft,
  isSending,
  canSend,
  requestError,
  copiedMessageId,
  onDraftChange,
  onSubmit,
  onKeyDown,
  onCopy,
  onStartNewConversation,
  onOpenConversation,
}: KernelChatModalProps) {
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  function startNewConversation() {
    onStartNewConversation()
    setMobileHistoryOpen(false)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  function openConversation(conversationId: string) {
    onOpenConversation(conversationId)
    setMobileHistoryOpen(false)
  }

  function chooseSuggestion(suggestion: string) {
    onDraftChange(suggestion)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const historyProps = {
    conversations,
    activeConversationId,
    error: historyError,
    loading: historyLoading,
    onStartNewConversation: startNewConversation,
    onOpenConversation: openConversation,
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            aria-label="Open chat with Kernel"
            title="Open chat with Kernel"
            className="kernel-chat-trigger fixed bottom-6 right-6 z-40 h-12 rounded-full border-0 bg-[#C15F3C] px-5 text-[#000] shadow-[0_10px_28px_rgba(193,95,60,.38)] transition hover:-translate-y-0.5 hover:bg-[#D97757] focus-visible:ring-2 focus-visible:ring-[#C15F3C] focus-visible:ring-offset-2"
          />
        }
      >
        <MessageSquareText data-icon="inline-start" aria-hidden="true" />
        <span>Chat with Kernel</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-5">
          <Dialog.Popup className="kernel-chat-popup relative flex h-[min(96dvh,54rem)] max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-[24px] border border-[#C7C7C7] bg-white text-[#000] shadow-[0_24px_90px_rgba(0,0,0,.24)] outline-none sm:h-[min(88dvh,54rem)] sm:max-w-5xl sm:rounded-[24px]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#DADADA] bg-white px-4 py-3.5 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F4F3EE]">
                  <img
                    src="/kernel-design-export/standalone/assets/kernel-logo.png"
                    alt=""
                    className="size-7 object-contain"
                  />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-base font-semibold tracking-tight sm:text-lg">
                    <span className="sr-only">Chat with Kernel</span>
                    <SkiperTextReveal text="Chat with Kernel" />
                  </Dialog.Title>
                  <Dialog.Description className="mt-0.5 truncate text-xs text-[#5E5E5E] sm:text-sm">
                    Writing, learning, coding and everything in between.
                  </Dialog.Description>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="hidden rounded-full border-[#C7C7C7] bg-white text-[#000] hover:bg-[#F7E6DF] sm:inline-flex"
                  onClick={startNewConversation}
                >
                  <Plus data-icon="inline-start" />
                  New chat
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open chat history"
                  title="Open chat history"
                  className="rounded-full text-[#000] hover:bg-[#F4F3EE] md:hidden"
                  onClick={() => setMobileHistoryOpen(true)}
                >
                  <Menu data-icon="inline-start" />
                </Button>
                <Dialog.Close
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close chat"
                      title="Close chat"
                      className="rounded-full text-[#000] hover:bg-[#F4F3EE]"
                    />
                  }
                >
                  <X data-icon="inline-start" aria-hidden="true" />
                </Dialog.Close>
              </div>
            </header>

            <div className="relative flex min-h-0 flex-1">
              <aside className="hidden w-64 shrink-0 flex-col border-r border-[#DADADA] bg-[#F8F7F3] md:flex">
                <ConversationHistory {...historyProps} />
              </aside>

              {mobileHistoryOpen && (
                <div className="absolute inset-0 z-20 flex md:hidden">
                  <button
                    type="button"
                    aria-label="Close chat history"
                    className="absolute inset-0 bg-black/20"
                    onClick={() => setMobileHistoryOpen(false)}
                  />
                  <aside className="relative z-10 flex h-full w-[min(82vw,18rem)] shrink-0 flex-col border-r border-[#DADADA] bg-[#F8F7F3] shadow-xl">
                    <ConversationHistory {...historyProps} />
                  </aside>
                </div>
              )}

              <main className="flex min-w-0 flex-1 flex-col bg-white">
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EAEAEA] px-4 py-2.5 sm:px-6 md:hidden">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-[#4A4A4A]">
                    <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {activeConversationId
                        ? conversations.find((item) => item.conversationId === activeConversationId)?.title ?? "Conversation"
                        : "New conversation"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 rounded-full text-[#000] hover:bg-[#F4F3EE]"
                    onClick={startNewConversation}
                  >
                    <Plus data-icon="inline-start" />
                    New
                  </Button>
                </div>

                <div className="min-h-0 flex-1">
                  <MessageScrollerProvider>
                    <MessageScroller className="h-full">
                      <MessageScrollerViewport>
                        <MessageScrollerContent
                          aria-label="Conversation messages"
                          className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-7 sm:py-7"
                        >
                          {messages.length > 0 ? (
                            <MessageGroup>
                              {messages.map((message, index) => (
                                <MessageScrollerItem
                                  key={message.id}
                                  scrollAnchor={index === messages.length - 1}
                                >
                                  <Message align={message.role === "user" ? "end" : "start"}>
                                    <MessageContent className="max-w-[92%] gap-1.5">
                                      <MessageHeader
                                        className={cn(
                                          "px-1 text-[#5E5E5E]",
                                          message.role === "user" && "justify-end",
                                        )}
                                      >
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
                                            <span className="inline-flex items-center gap-2 text-sm text-[#5E5E5E]">
                                              <span className="size-1.5 animate-pulse rounded-full bg-[#C15F3C]" />
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
                                            aria-label={copiedMessageId === message.id ? "Response copied" : "Copy response"}
                                            onClick={() => onCopy(message)}
                                            className="text-[#5E5E5E] hover:text-[#000]"
                                          >
                                            {copiedMessageId === message.id ? (
                                              <Check data-icon="inline-start" />
                                            ) : (
                                              <span className="text-xs">Copy</span>
                                            )}
                                          </Button>
                                        </div>
                                      )}
                                    </MessageContent>
                                  </Message>
                                </MessageScrollerItem>
                              ))}
                            </MessageGroup>
                          ) : (
                            <div className="grid min-h-[20rem] place-content-center gap-3 px-2 py-8 text-center sm:min-h-[24rem] sm:px-8">
                              <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#F7E6DF] text-[#A94B2B]">
                                <Sparkles className="size-5" aria-hidden="true" />
                              </span>
                              <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                                What would you like to think through?
                              </h2>
                              <p className="mx-auto max-w-md text-sm leading-relaxed text-[#5E5E5E]">
                                An AI assistant for writing, learning, coding and everything in between.
                              </p>
                              <div className="mx-auto mt-2 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                                {suggestions.map((suggestion) => (
                                  <button
                                    type="button"
                                    key={suggestion}
                                    onClick={() => chooseSuggestion(suggestion)}
                                    className="rounded-2xl border border-[#DADADA] bg-white px-4 py-3 text-left text-sm leading-relaxed text-[#262626] transition hover:-translate-y-0.5 hover:border-[#C15F3C] hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C15F3C]"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </MessageScrollerContent>
                        <MessageScrollerButton className="border-[#C7C7C7] bg-white text-[#000] hover:bg-[#F4F3EE]" />
                      </MessageScrollerViewport>
                    </MessageScroller>
                  </MessageScrollerProvider>
                </div>

                <div className="shrink-0 border-t border-[#DADADA] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-4">
                  {requestError && (
                    <p
                      role="alert"
                      className="mx-auto mb-3 max-w-3xl rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      {requestError}
                    </p>
                  )}
                  <form
                    onSubmit={onSubmit}
                    className="mx-auto max-w-3xl rounded-[20px] border border-[#C7C7C7] bg-[#F8F7F3] p-2 shadow-[0_8px_24px_rgba(0,0,0,.06)] transition focus-within:border-[#C15F3C] focus-within:shadow-[0_8px_28px_rgba(193,95,60,.12)]"
                  >
                    <label htmlFor="kernel-modal-composer" className="sr-only">
                      Message Kernel
                    </label>
                    <textarea
                      ref={composerRef}
                      id="kernel-modal-composer"
                      value={draft}
                      onChange={(event) => onDraftChange(event.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={canSend ? "Message Kernel…" : "Chat is unavailable right now"}
                      rows={2}
                      maxLength={8_000}
                      disabled={!canSend || isSending}
                      className="max-h-40 min-h-16 w-full resize-y bg-transparent px-3 pt-2 text-sm leading-relaxed text-[#000] outline-none placeholder:text-[#777] disabled:cursor-not-allowed"
                    />
                    <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
                      <p className="text-[11px] text-[#5E5E5E] sm:text-xs">
                        Enter to send · Shift + Enter for a new line
                      </p>
                      <Button
                        type="submit"
                        size="icon"
                        aria-label={isSending ? "Generating response" : "Send message"}
                        disabled={!draft.trim() || !canSend || isSending}
                        className="size-10 rounded-full border-0 bg-[#C15F3C] text-[#000] hover:bg-[#D97757]"
                      >
                        <ArrowUp data-icon="inline-start" />
                      </Button>
                    </div>
                  </form>
                  <p className="mx-auto mt-2 flex max-w-3xl items-center justify-center gap-1.5 text-center text-[10px] leading-relaxed text-[#777] sm:text-[11px]">
                    Chat history is saved in this Kernel instance · Motion adapted from{" "}
                    <a
                      href="https://skiper-ui.com/v1/skiper31"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#5E5E5E] underline decoration-[#C7C7C7] underline-offset-2 hover:text-[#A94B2B]"
                    >
                      Skiper UI
                    </a>
                  </p>
                </div>
              </main>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
