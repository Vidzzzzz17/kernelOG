import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

type DatabaseGlobal = typeof globalThis & { kernelPool?: Pool }
const databaseGlobal = globalThis as DatabaseGlobal

export function getDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to load chat history.")
  }

  const pool =
    databaseGlobal.kernelPool ??
    new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    })

  if (!databaseGlobal.kernelPool) databaseGlobal.kernelPool = pool
  return drizzle(pool, { schema })
}
