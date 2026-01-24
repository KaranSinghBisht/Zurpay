'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface InviteData {
  workerEmail: string;
  orgName: string;
  displayName?: string;
  expiresAt: string;
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    fetchInvite();
  }, [params.token]);

  const fetchInvite = async () => {
    try {
      const response = await fetch(`/api/invite/${params.token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Invite not found');
      }
      const data = await response.json();
      setInvite(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!session?.user?.email) {
      signIn('google', { callbackUrl: `/invite/${params.token}` });
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invite/${params.token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session.user.email }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept invite');
      }

      router.push('/claims');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">:(</div>
          <h2 className="text-xl font-semibold mb-2">Invite Not Found</h2>
          <p className="text-zinc-400">{error || 'This invite link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const isExpired = new Date(invite.expiresAt) < new Date();
  const emailMatch = session?.user?.email?.toLowerCase() === invite.workerEmail.toLowerCase();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-4xl mb-4">Welcome to Zurpay</div>
          <h2 className="text-xl font-semibold">You've been invited!</h2>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="text-sm text-zinc-400">Organization</div>
            <div className="font-medium">{invite.orgName}</div>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="text-sm text-zinc-400">Invited Email</div>
            <div className="font-medium">{invite.workerEmail}</div>
          </div>

          {invite.displayName && (
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <div className="text-sm text-zinc-400">Name</div>
              <div className="font-medium">{invite.displayName}</div>
            </div>
          )}
        </div>

        {isExpired ? (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-center">
            <p className="text-red-400">This invite has expired. Please contact your employer.</p>
          </div>
        ) : status === 'loading' ? (
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !session ? (
          <button
            onClick={() => signIn('google', { callbackUrl: `/invite/${params.token}` })}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-3 px-4 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google to Accept
          </button>
        ) : !emailMatch ? (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-center">
            <p className="text-yellow-400 mb-2">
              You're signed in as <strong>{session.user?.email}</strong>
            </p>
            <p className="text-yellow-400/80 text-sm mb-3">
              This invite is for <strong>{invite.workerEmail}</strong>
            </p>
            <button
              onClick={() => signIn('google', { callbackUrl: `/invite/${params.token}` })}
              className="text-sm text-yellow-400 underline hover:text-yellow-300"
            >
              Sign in with a different account
            </button>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 rounded-lg font-medium transition-colors"
          >
            {accepting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Accepting...
              </span>
            ) : (
              'Accept Invite'
            )}
          </button>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
