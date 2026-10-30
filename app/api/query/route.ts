import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { streamText } from "ai"
import { getDb } from "@/lib/db"
import { kernelMessages, type MessageRole } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { getSessionHash } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const rateLimitWindowMs = 60_000
const rateLimitMaximum = 20
const rateLimit = new Map<string, { count: number; resetAt: number }>()
const modelId = "alibaba/qwen3.5-flash"

function getClientAddress(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

function consumeRateLimit(address: string) {
  const now = Date.now()
  const current = rateLimit.get(address)

  if (!current || current.resetAt <= now) {
    rateLimit.set(address, { count: 1, resetAt: now + rateLimitWindowMs })
    return { allowed: true, retryAfter: 0 }
  }

  if (current.count >= rateLimitMaximum) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)) }
  }

  current.count += 1
  if (rateLimit.size > 5_000) {
    for (const [key, entry] of rateLimit) {
      if (entry.resetAt <= now) rateLimit.delete(key)
    }
  }
  return { allowed: true, retryAfter: 0 }
}

function errorResponse(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, { status, headers })
}

function getGenerationErrorMessage(details: string) {
  const normalized = details.toLowerCase()
  if (normalized.includes("customer_verification_required") || normalized.includes("valid credit card")) {
    return "AI Gateway needs a valid payment method before chat can start. Add a card in Vercel AI Gateway settings to unlock its free credits."
  }
  return "Kernel could not complete that response. Please try again."
}

function encodeEvent(controller: ReadableStreamDefaultController<Uint8Array>, data: object) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
}

export async function POST(request: Request) {
  const address = getClientAddress(request)
  const limit = consumeRateLimit(address)
  if (!limit.allowed) {
    return errorResponse("Too many requests. Try again shortly.", 429, {
      "Retry-After": String(limit.retryAfter),
    })
  }

  const origin = request.headers.get("origin")
  if (!origin) return errorResponse("A same-origin request is required.", 403)
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return errorResponse("This request origin is not allowed.", 403)
    }
  } catch {
    return errorResponse("This request origin is not allowed.", 403)
  }

  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 16_000) return errorResponse("Message is too large.", 413)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse("Request body must be valid JSON.", 400)
  }

  if (!body || typeof body !== "object") {
    return errorResponse("Request body must be an object.", 400)
  }

  const input = body as Record<string, unknown>
  const content = typeof input.message === "string" ? input.message.trim() : ""
  const newConversation = input.newConversation === true
  const conversationId = input.conversationId

  if (!content || content.length > 8_000) {
    return errorResponse("Enter a message between 1 and 8,000 characters.", 400)
  }
  if (!isUuid(conversationId)) return errorResponse("Conversation not found.", 404)

  try {
    const db = getDb()
    const sessionHash = await getSessionHash()
    const existingRows = await db
      .select({ id: kernelMessages.id })
      .from(kernelMessages)
      .where(
        and(
          eq(kernelMessages.sessionHash, sessionHash),
          eq(kernelMessages.conversationId, conversationId),
        ),
      )
      .limit(1)

    if (newConversation && existingRows.length > 0) {
      return errorResponse("Conversation already exists. Start a new chat.", 409)
    }
    if (!newConversation && existingRows.length === 0) {
      return errorResponse("Conversation not found.", 404)
    }

    const previousMessages = newConversation
      ? []
      : await db
          .select({ role: kernelMessages.role, content: kernelMessages.content })
          .from(kernelMessages)
          .where(
            and(
              eq(kernelMessages.sessionHash, sessionHash),
              eq(kernelMessages.conversationId, conversationId),
            ),
          )
          .orderBy(desc(kernelMessages.createdAt))
          .limit(24)

    await db.insert(kernelMessages).values({
      id: randomUUID(),
      conversationId,
      sessionHash,
      role: "user",
      content,
    })

    let generationError = ""
    const result = streamText({
      model: modelId,
      instructions:
        "You are Kernel, a clear, thoughtful AI assistant for writing, learning, coding, and everyday problem solving. Be helpful, accurate, and concise. If you are unsure, say so.",
      messages: [
        ...previousMessages.reverse().map((message) => ({
          role: message.role as MessageRole,
          content: message.content,
        })),
        { role: "user" as const, content },
      ],
      abortSignal: request.signal,
      onError({ error }) {
        generationError = error instanceof Error ? error.message : String(error)
      },
    })

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let assistantContent = ""
        let streamFailed = false

        try {
          encodeEvent(controller, { type: "meta", conversationId })

          for await (const part of result.stream) {
            if (part.type === "text-delta") {
              assistantContent += part.text
              encodeEvent(controller, { type: "token", content: part.text })
            } else if (part.type === "error") {
              streamFailed = true
            }
          }

          const finishReason = await result.finishReason
          if (streamFailed || finishReason === "error") {
            encodeEvent(controller, {
              type: "error",
              message: getGenerationErrorMessage(generationError),
            })
            controller.close()
            return
          }
          if (!assistantContent.trim()) {
            encodeEvent(controller, {
              type: "error",
              message: "Kernel returned an empty response. Please try again.",
            })
            controller.close()
            return
          }

          await db.insert(kernelMessages).values({
            id: randomUUID(),
            conversationId,
            sessionHash,
            role: "assistant",
            content: assistantContent,
          })

          encodeEvent(controller, { type: "done", conversationId })
          controller.close()
        } catch {
          if (!request.signal.aborted) {
            try {
              encodeEvent(controller, {
                type: "error",
                message: "The response could not be saved or completed. Please try again.",
              })
              controller.close()
            } catch {
              return
            }
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch {
    return errorResponse("The chat request could not be saved or sent. Please try again.", 500)
  }
}
