'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold text-red-400">Something went wrong</h2>
      <p className="text-zinc-400">{error.message || 'An unexpected error occurred'}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white"
      >
        Try again
      </button>
    </div>
  );
}
