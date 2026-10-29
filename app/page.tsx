"use client"

import { useEffect, useState } from "react"

export default function Page() {
  const [installable, setInstallable] = useState(false)

  useEffect(() => {
    const handler = () => setInstallable(true)
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  return (
    <main className="relative min-h-screen bg-white">
      <iframe
        title="Kernel public marketing website"
        src="/kernel/Main.html"
        className="block h-screen w-full border-0"
      />
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-black/10 bg-white/95 px-4 py-2 text-sm shadow-2xl backdrop-blur">
          <span className="hidden text-black/60 sm:inline">Kernel is ready to install</span>
          <a
            href="/kernel/Main.html#download"
            className="rounded-full bg-black px-4 py-2 font-medium text-white transition hover:bg-[#c15f3c]"
          >
            Download app
          </a>
          {installable && <span className="text-xs text-black/50">Install from browser menu</span>}
        </div>
      </div>
    </main>
  )
}
