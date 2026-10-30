export type OllamaModel = {
  name: string
  size?: number
  parameterSize?: string
}

export type OllamaModelStatus = {
  connected: boolean
  models: OllamaModel[]
  error?: string
}

export function getOllamaBaseUrl() {
  const configuredUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434"
  const url = new URL(configuredUrl)

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("OLLAMA_BASE_URL must be an HTTP or HTTPS server URL without credentials.")
  }

  url.pathname = url.pathname.replace(/\/+$/, "")
  return url.toString().replace(/\/$/, "")
}

export async function listOllamaModels(): Promise<OllamaModelStatus> {
  try {
    const response = await fetch(`${getOllamaBaseUrl()}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      redirect: "error",
    })

    if (!response.ok) {
      return {
        connected: false,
        models: [],
        error: "Ollama responded with an error. Check that the Ollama app is running.",
      }
    }

    const payload: { models?: Array<{ name?: string; model?: string; size?: number; details?: { parameter_size?: string } }> } =
      await response.json()
    const models = (payload.models ?? [])
      .map((model) => ({
        name: model.name || model.model || "",
        size: model.size,
        parameterSize: model.details?.parameter_size,
      }))
      .filter((model) => model.name.length > 0)

    return { connected: true, models }
  } catch {
    return {
      connected: false,
      models: [],
      error: "Ollama is not reachable from the server running Kernel.",
    }
  }
}
