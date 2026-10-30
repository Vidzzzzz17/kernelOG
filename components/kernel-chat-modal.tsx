"use client"

import type { FormEvent, KeyboardEvent } from "react"
import { ArrowUp, Check, MessageSquareText, X } from "lucide-react"
import { Dialog } from "@base-ui/react/dialog"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Message, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

type KernelChatModalProps = {
  messages: ChatMessage[]
  draft: string
  isSending: boolean
  canSend: boolean
  requestError: string
  copiedMessageId: string
  onDraftChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onCopy: (message: ChatMessage) => void
}

export function KernelChatModal({
  messages,
  draft,
  isSending,
  canSend,
  requestError,
  copiedMessageId,
  onDraftChange,
  onSubmit,
  onKeyDown,
  onCopy,
}: KernelChatModalProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 px-0 sm:h-8 sm:w-auto sm:px-2.5"
            aria-label="Open chat"
            title="Open chat"
          />
        }
      >
        <MessageSquareText data-icon="inline-start" />
        <span className="hidden sm:inline">Chat</span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <Dialog.Popup className="relative flex h-[min(96dvh,52rem)] max-h-[calc(100dvh-0.5rem)] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background text-foreground shadow-xl outline-none sm:h-[min(86dvh,52rem)] sm:max-w-3xl sm:rounded-2xl">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold tracking-tight sm:text-lg">Chat with Kernel</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  Continue your current conversation from any screen size.
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Close chat" />
                }
              >
                <X data-icon="inline-start" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1">
              <MessageScrollerProvider>
                <MessageScroller className="h-full">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-7">
                      {messages.length > 0 ? (
                        <MessageGroup>
                          {messages.map((message, index) => (
                            <MessageScrollerItem key={message.id} scrollAnchor={index === messages.length - 1}>
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
                                        aria-label={copiedMessageId === message.id ? "Response copied" : "Copy response"}
                                        onClick={() => onCopy(message)}
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
                      ) : (
                        <div className="grid min-h-[14rem] place-content-center gap-2 px-4 text-center">
                          <MessageSquareText className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
                          <p className="text-sm font-medium">Start a conversation</p>
                          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                            {canSend
                              ? "Send a message below. Your chat will stay in the conversation history."
                              : "Connect Ollama and choose a model in Settings to start chatting."}
                          </p>
                        </div>
                      )}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                </MessageScroller>
              </MessageScrollerProvider>
            </div>

            <div className="shrink-0 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
              {requestError && (
                <p role="alert" className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {requestError}
                </p>
              )}
              <form onSubmit={onSubmit} className="rounded-2xl border border-input bg-card shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
                <label htmlFor="mobile-chat-input" className="sr-only">Message Kernel</label>
                <textarea
                  id="mobile-chat-input"
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={canSend ? "Message your local model…" : "Connect Ollama to begin"}
                  rows={2}
                  maxLength={8_000}
                  disabled={!canSend || isSending}
                  className="max-h-40 min-h-16 w-full resize-y bg-transparent px-4 pt-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
                />
                <div className="flex items-center justify-between gap-3 px-3 pb-3">
                  <p className="text-xs text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
                  <Button
                    type="submit"
                    size="icon"
                    aria-label={isSending ? "Generating response" : "Send message"}
                    disabled={!draft.trim() || !canSend || isSending}
                  >
                    <ArrowUp data-icon="inline-start" />
                  </Button>
                </div>
              </form>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Messages go to the Ollama server configured for this app.
              </p>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
