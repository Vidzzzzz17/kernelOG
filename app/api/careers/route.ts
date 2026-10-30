import careers from "../../../content/careers.json"
import { NextResponse } from "next/server"

export function GET() {
  return NextResponse.json(careers)
}
