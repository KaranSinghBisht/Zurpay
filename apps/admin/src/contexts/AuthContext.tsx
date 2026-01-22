'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

// Use relative paths for Next.js API routes
const API_BASE = '';

interface AuthState {
  token: string | null;
  wallet: string | null;
  expiresAt: Date | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = 'zurpay_auth_token';
const WALLET_KEY = 'zurpay_auth_wallet';
const EXPIRES_KEY = 'zurpay_auth_expires';

function loadStoredAuth(): Partial<AuthState> {
  if (typeof window === 'undefined') return {};

  const token = localStorage.getItem(TOKEN_KEY);
  const wallet = localStorage.getItem(WALLET_KEY);
  const expiresStr = localStorage.getItem(EXPIRES_KEY);

  if (!token || !wallet || !expiresStr) return {};

  const expiresAt = new Date(expiresStr);
  if (expiresAt < new Date()) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(WALLET_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    return {};
  }

  return { token, wallet, expiresAt, isAuthenticated: true };
}

function saveAuth(token: string, wallet: string, expiresAt: Date) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(WALLET_KEY, wallet);
  localStorage.setItem(EXPIRES_KEY, expiresAt.toISOString());
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const [state, setState] = useState<AuthState>({
    token: null,
    wallet: null,
    expiresAt: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored.token && stored.wallet === walletAddress) {
      setState({
        token: stored.token,
        wallet: stored.wallet ?? null,
        expiresAt: stored.expiresAt ?? null,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [walletAddress]);

  const [prevWalletAddress, setPrevWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!connected && state.isAuthenticated) {
      setPrevWalletAddress(state.wallet);
      setState({
        token: null,
        wallet: null,
        expiresAt: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, [connected, state.isAuthenticated, state.wallet]);

  useEffect(() => {
    if (connected && walletAddress && !state.isAuthenticated && !state.isLoading) {
      const stored = loadStoredAuth();

      if (stored.token && stored.wallet === walletAddress) {
        console.log('[Auth] Restoring session for reconnected wallet:', walletAddress);
        setState({
          token: stored.token,
          wallet: stored.wallet ?? null,
          expiresAt: stored.expiresAt ?? null,
          isAuthenticated: true,
          isLoading: false,
        });
      } else if (prevWalletAddress === walletAddress) {
        console.log('[Auth] Same wallet reconnected but needs re-auth:', walletAddress);
      } else if (prevWalletAddress && prevWalletAddress !== walletAddress) {
        console.log('[Auth] Different wallet connected, clearing old auth');
        clearAuth();
      }
    }
  }, [connected, walletAddress, state.isAuthenticated, state.isLoading, prevWalletAddress]);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage || !walletAddress) {
      throw new Error('Wallet not connected');
    }

    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      console.log('[Auth] Starting sign-in for wallet:', walletAddress);

      const challengeRes = await fetch(`${API_BASE}/api/auth/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });

      if (!challengeRes.ok) {
        const err = await challengeRes.json().catch(() => ({}));
        console.error('[Auth] Challenge failed:', err);
        throw new Error(err.error || 'Failed to get challenge');
      }

      const { message } = await challengeRes.json();
      console.log('[Auth] Got challenge, signing message...');

      const messageString = `${message.domain} wants you to sign in with your Solana account:\n${message.address}\n\n${message.statement}\n\nURI: ${message.uri}\nVersion: ${message.version}\nChain ID: ${message.chainId}\nNonce: ${message.nonce}\nIssued At: ${message.issuedAt}${message.expirationTime ? `\nExpiration Time: ${message.expirationTime}` : ''}`;

      const messageBytes = new TextEncoder().encode(messageString);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      console.log('[Auth] Signature obtained, verifying...');

      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        console.error('[Auth] Verify failed:', err);
        throw new Error(err.error || 'Authentication failed');
      }

      const { token, wallet, expiresAt: expiresAtStr } = await verifyRes.json();
      const expiresAt = new Date(expiresAtStr);

      console.log('[Auth] Verification successful!');
      console.log('[Auth] Token received:', token ? `${token.slice(0, 30)}...` : 'null');
      console.log('[Auth] Expires at:', expiresAt.toISOString());

      saveAuth(token, wallet, expiresAt);

      // Verify it was saved correctly
      const savedToken = localStorage.getItem('zurpay_auth_token');
      console.log(
        '[Auth] Token saved to localStorage:',
        savedToken ? `${savedToken.slice(0, 30)}...` : 'null'
      );

      setState({
        token,
        wallet,
        expiresAt,
        isAuthenticated: true,
        isLoading: false,
      });

      console.log('[Auth] Sign-in complete, isAuthenticated: true');
    } catch (error) {
      console.error('[Auth] Sign-in error:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [publicKey, signMessage, walletAddress]);

  const signOut = useCallback(async () => {
    if (state.token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.token}`,
          },
        });
      } catch (error) {
        console.error('Logout API error:', error);
      }
    }

    clearAuth();
    setState({
      token: null,
      wallet: null,
      expiresAt: null,
      isAuthenticated: false,
      isLoading: false,
    });

    disconnect();
  }, [state.token, disconnect]);

  const value = useMemo(
    () => ({
      ...state,
      signIn,
      signOut,
    }),
    [state, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(TOKEN_KEY);
  const expiresStr = localStorage.getItem(EXPIRES_KEY);

  if (!token || !expiresStr) return null;

  const expiresAt = new Date(expiresStr);
  if (expiresAt < new Date()) {
    clearAuth();
    return null;
  }

  return token;
}
