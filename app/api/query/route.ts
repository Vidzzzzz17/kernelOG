import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { kernelMessages, type MessageRole } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { getOllamaBaseUrl, listOllamaModels } from "@/lib/ollama"
import { getSessionHash } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const rateLimitWindowMs = 60_000
const rateLimitMaximum = 20
const rateLimit = new Map<string, { count: number; resetAt: number }>()

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
  if (contentLength > 16_000) {
    return errorResponse("Message is too large.", 413)
  }

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
  const model = typeof input.model === "string" ? input.model.trim() : ""
  const newConversation = input.newConversation === true
  const conversationId = input.conversationId

  if (!content || content.length > 8_000) {
    return errorResponse("Enter a message between 1 and 8,000 characters.", 400)
  }
  if (!model || model.length > 200) {
    return errorResponse("Choose an installed Ollama model.", 400)
  }
  if (!isUuid(conversationId)) {
    return errorResponse("Conversation not found.", 404)
  }

  const modelStatus = await listOllamaModels()
  if (!modelStatus.connected) {
    return errorResponse(
      "Ollama is not reachable from the server running Kernel. Start Ollama or configure OLLAMA_BASE_URL.",
      503,
    )
  }
  if (!modelStatus.models.some((availableModel) => availableModel.name === model)) {
    return errorResponse("That model is not installed in Ollama. Refresh the model list and choose another.", 400)
  }

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

    const ollamaMessages: Array<{ role: MessageRole; content: string }> = [
      ...previousMessages.reverse().map((message) => ({
        role: message.role as MessageRole,
        content: message.content,
      })),
      { role: "user", content },
    ]

    const upstream = await fetch(`${getOllamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: true }),
      cache: "no-store",
      redirect: "error",
      signal: request.signal,
    })

    if (!upstream.ok || !upstream.body) {
      return errorResponse("Ollama could not start a response. Check the server and model, then retry.", 502)
    }

    try {
      await db.insert(kernelMessages).values({
        id: randomUUID(),
        conversationId,
        sessionHash,
        role: "user",
        content,
      })
    } catch {
      await upstream.body.cancel().catch(() => undefined)
      return errorResponse("The message could not be saved to the configured database.", 500)
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let assistantContent = ""
        let buffer = ""
        const decoder = new TextDecoder()

        try {
          encodeEvent(controller, { type: "meta", conversationId })
          const reader = upstream.body!.getReader()

          const processLine = (line: string) => {
            const trimmed = line.trim()
            if (!trimmed) return

            const chunk = JSON.parse(trimmed) as {
              message?: { content?: string }
              done?: boolean
            }
            const token = chunk.message?.content

            if (typeof token === "string" && token.length > 0) {
              assistantContent += token
              encodeEvent(controller, { type: "token", content: token })
            }
          }

          while (true) {
            const { done, value } = await reader.read()
            buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() ?? ""
            for (const line of lines) processLine(line)
            if (done) break
          }
          if (buffer.trim()) processLine(buffer)

          if (!assistantContent.trim()) {
            encodeEvent(controller, { type: "error", message: "Ollama returned an empty response. Try another model." })
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
          try {
            encodeEvent(controller, {
              type: "error",
              message: "The response stream ended unexpectedly. Check Ollama and try again.",
            })
            controller.close()
          } catch {
            upstream.body?.cancel().catch(() => undefined)
          }
        }
      },
      cancel() {
        upstream.body?.cancel().catch(() => undefined)
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
    return errorResponse("The chat request could not be saved or sent. Check the database and Ollama connection.", 500)
  }
}
