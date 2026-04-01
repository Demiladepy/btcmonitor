import { Suspense } from "react";
import { TransactContent } from "./TransactContent";

function TransactFallback() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-gray-500 text-sm">Loading transact…</div>
    </div>
  );
}

export default function TransactPage() {
  return (
    <Suspense fallback={<TransactFallback />}>
      <TransactContent />
    </Suspense>
  );
}
