import reviews from "../../../content/reviews.json"
import { NextResponse } from "next/server"

export function GET() {
  return NextResponse.json(reviews)
}
