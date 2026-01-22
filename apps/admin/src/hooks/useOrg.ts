'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api, Org } from '../lib/api';

export interface OrgContext {
  org: Org | null;
  orgs: Org[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectOrg: (orgId: string) => void;
}

export function useOrg(): OrgContext {
  const { publicKey } = useWallet();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = publicKey?.toBase58();

  const refresh = useCallback(async () => {
    if (!wallet) {
      setOrgs([]);
      setSelectedOrgId(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const fetchedOrgs = await api.orgs.list(wallet);
      setOrgs(fetchedOrgs);

      if (fetchedOrgs.length > 0) {
        const stored = localStorage.getItem('zurpay_selected_org');
        const storedOrgExists = fetchedOrgs.some((o) => o.id === stored);

        if (stored && storedOrgExists) {
          setSelectedOrgId(stored);
        } else {
          setSelectedOrgId(fetchedOrgs[0].id);
          localStorage.setItem('zurpay_selected_org', fetchedOrgs[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
    localStorage.setItem('zurpay_selected_org', orgId);
  };

  const org = orgs.find((o) => o.id === selectedOrgId) || null;

  return { org, orgs, loading, error, refresh, selectOrg };
}
