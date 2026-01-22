'use client';

import { useOrg } from '../contexts/OrgContext';

export function SidebarOrgSection() {
  const { org, orgs, isLoading, selectOrg } = useOrg();

  if (isLoading) {
    return (
      <div className="mt-auto glass border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-zinc-700 animate-pulse" />
          <div>
            <div className="h-4 w-20 bg-zinc-700 rounded animate-pulse mb-1" />
            <div className="h-3 w-12 bg-zinc-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="mt-auto glass border border-white/5 p-4 rounded-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700" />
          <div>
            <p className="text-sm font-semibold text-zinc-400">No Organization</p>
            <p className="text-xs text-gray-500">Create one to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-auto glass border border-white/5 p-4 rounded-2xl">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent" />
        <div>
          <p className="text-sm font-semibold">{org.name}</p>
          <p className="text-xs text-gray-400">Devnet</p>
        </div>
      </div>
      {orgs.length > 1 && (
        <select
          value={org.id}
          onChange={(e) => selectOrg(e.target.value)}
          className="w-full py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium transition-colors border border-white/10 cursor-pointer"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id} className="bg-zinc-900">
              {o.name}
            </option>
          ))}
        </select>
      )}
      {orgs.length <= 1 && (
        <button
          disabled
          className="w-full py-2 rounded-lg bg-white/5 text-xs font-medium text-zinc-500 cursor-not-allowed"
        >
          Switch Organization
        </button>
      )}
    </div>
  );
}
