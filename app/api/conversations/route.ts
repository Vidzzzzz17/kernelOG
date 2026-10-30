import { desc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { kernelMessages } from "@/lib/db/schema"
import { getSessionHash } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const db = getDb()
    const sessionHash = await getSessionHash()
    const rows = await db
      .select({
        conversationId: kernelMessages.conversationId,
        role: kernelMessages.role,
        content: kernelMessages.content,
        createdAt: kernelMessages.createdAt,
      })
      .from(kernelMessages)
      .where(eq(kernelMessages.sessionHash, sessionHash))
      .orderBy(desc(kernelMessages.createdAt))
      .limit(5_000)

    const conversations = new Map<
      string,
      { conversationId: string; title: string; updatedAt: Date; messageCount: number }
    >()

    for (const row of rows) {
      const conversationId = row.conversationId
      let conversation = conversations.get(conversationId)

      if (!conversation) {
        conversation = {
          conversationId,
          title: "New chat",
          updatedAt: row.createdAt,
          messageCount: 0,
        }
        conversations.set(conversationId, conversation)
      }

      if (row.role === "user") {
        conversation.title = row.content.replace(/\s+/g, " ").trim().slice(0, 96) || "New chat"
      }
      conversation.messageCount += 1
    }

    return Response.json(
      { conversations: Array.from(conversations.values()).slice(0, 50) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return Response.json({ error: "Chat history could not be loaded." }, { status: 500 })
  }
}
