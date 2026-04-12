"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-bold text-gray-900">Something went wrong</h2>
        <p className="text-gray-500 text-sm break-words">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="bg-amber-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-600 min-h-[44px]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
