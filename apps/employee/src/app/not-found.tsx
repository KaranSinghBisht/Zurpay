import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-bold text-zinc-200">Page Not Found</h2>
      <p className="text-zinc-400">The page you're looking for doesn't exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white"
      >
        Go Home
      </Link>
    </div>
  );
}
