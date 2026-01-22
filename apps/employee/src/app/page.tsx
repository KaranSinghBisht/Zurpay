export default function Home() {
  return (
    <div className="py-12">
      <h1 className="text-3xl font-bold mb-4">Welcome to Zurpay</h1>
      <p className="text-zinc-400 mb-8">
        Connect your wallet to view and claim your confidential salary.
      </p>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-medium mb-4">Pending Claims</h2>
        <p className="text-zinc-500">Connect wallet to see your pending claims.</p>
      </div>
    </div>
  );
}
