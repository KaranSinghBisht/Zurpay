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
import { api, Org } from '../lib/api';
import { useAuth } from './AuthContext';

interface OrgContextType {
  org: Org | null;
  orgs: Org[];
  isLoading: boolean;
  error: string | null;
  refreshOrg: () => Promise<void>;
  selectOrg: (orgId: string) => void;
}

const OrgContext = createContext<OrgContextType | null>(null);

const SELECTED_ORG_KEY = 'zurpay_selected_org';

export function OrgProvider({ children }: { children: ReactNode }) {
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuth();
  const wallet = publicKey?.toBase58();

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(SELECTED_ORG_KEY);
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    if (!wallet || !isAuthenticated) {
      setOrgs([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const fetchedOrgs = await api.orgs.list(wallet);
      setOrgs(fetchedOrgs);

      if (fetchedOrgs.length > 0) {
        const storedOrgId = localStorage.getItem(SELECTED_ORG_KEY);
        const validStoredOrg = fetchedOrgs.find((o) => o.id === storedOrgId);

        if (validStoredOrg) {
          setSelectedOrgId(validStoredOrg.id);
        } else {
          setSelectedOrgId(fetchedOrgs[0].id);
          localStorage.setItem(SELECTED_ORG_KEY, fetchedOrgs[0].id);
        }
      }
    } catch (err) {
      console.error('[OrgContext] Failed to load orgs:', err);
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, [wallet, isAuthenticated]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const selectOrg = useCallback((orgId: string) => {
    setSelectedOrgId(orgId);
    localStorage.setItem(SELECTED_ORG_KEY, orgId);
  }, []);

  const org = useMemo(
    () => orgs.find((o) => o.id === selectedOrgId) || orgs[0] || null,
    [orgs, selectedOrgId]
  );

  const value = useMemo(
    () => ({
      org,
      orgs,
      isLoading,
      error,
      refreshOrg: loadOrgs,
      selectOrg,
    }),
    [org, orgs, isLoading, error, loadOrgs, selectOrg]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (!context) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}
