import { listOllamaModels } from "@/lib/ollama"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const status = await listOllamaModels()
  return Response.json(status, { headers: { "Cache-Control": "no-store" } })
}
