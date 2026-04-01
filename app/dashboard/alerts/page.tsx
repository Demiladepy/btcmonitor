"use client";

import { useRouter } from "next/navigation";

/** Placeholder: Step 4 adds thresholds, Telegram, and Prisma-backed history. */
export default function AlertsPlaceholderPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-4 max-w-6xl mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold">
          BTC Health <span className="text-amber-500">Monitor</span>
        </h1>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          ← Dashboard
        </button>
      </nav>
      <div className="max-w-lg mx-auto px-6 py-16 text-center space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">Alerts</h2>
        <p className="text-gray-500">
          Alert preferences, Telegram linking, and email will be added in the next step.
        </p>
      </div>
    </div>
  );
}
