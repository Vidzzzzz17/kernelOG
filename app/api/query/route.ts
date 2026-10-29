import { generateText } from "ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const query = typeof body?.query === "string" ? body.query.trim() : ""
    if (!query || query.length > 4000) {
      return NextResponse.json({ error: "Enter a query up to 4,000 characters." }, { status: 400 })
    }

    const result = await generateText({
      model: "google/gemini-3-flash",
      system: "You are Kernel, a concise and helpful general-purpose AI assistant. Answer clearly and safely.",
      prompt: query,
    })

    return NextResponse.json({ answer: result.text, model: "google/gemini-3-flash" })
  } catch {
    return NextResponse.json({ error: "The model could not answer right now." }, { status: 500 })
  }
}
