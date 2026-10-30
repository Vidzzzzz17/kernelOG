import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"

const cookieName = "kernel_session"
const previewRuntime = Boolean(
  process.env.V0_RUNTIME_URL ||
    process.env.V0_DEV_APP_URL ||
    process.env.V0_BUILD_URL ||
    process.env.V0_SANDBOX_URL,
)

export async function getSessionHash() {
  const cookieStore = await cookies()
  let token = cookieStore.get(cookieName)?.value

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    token = randomBytes(32).toString("base64url")
    cookieStore.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" || previewRuntime,
      sameSite: previewRuntime ? "none" : "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  return createHash("sha256").update(token).digest("hex")
}
