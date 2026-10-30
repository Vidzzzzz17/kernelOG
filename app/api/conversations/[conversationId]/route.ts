import { and, asc, desc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { kernelMessages } from "@/lib/db/schema"
import { isUuid } from "@/lib/ids"
import { getSessionHash } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params

  if (!isUuid(conversationId)) {
    return Response.json({ error: "Conversation not found." }, { status: 404 })
  }

  try {
    const db = getDb()
    const sessionHash = await getSessionHash()
    const rows = await db
      .select({
        id: kernelMessages.id,
        conversationId: kernelMessages.conversationId,
        role: kernelMessages.role,
        content: kernelMessages.content,
        createdAt: kernelMessages.createdAt,
      })
      .from(kernelMessages)
      .where(
        and(
          eq(kernelMessages.sessionHash, sessionHash),
          eq(kernelMessages.conversationId, conversationId),
        ),
      )
      .orderBy(desc(kernelMessages.createdAt))
      .limit(500)

    if (rows.length === 0) {
      return Response.json({ error: "Conversation not found." }, { status: 404 })
    }

    return Response.json(
      { messages: rows.reverse() },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return Response.json({ error: "Conversation could not be loaded." }, { status: 500 })
  }
}
