import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const kernelMessages = pgTable("kernel_messages", {
  id: uuid("id").primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  sessionHash: text("session_hash").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export type MessageRole = "user" | "assistant"
