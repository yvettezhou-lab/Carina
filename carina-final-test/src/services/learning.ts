import { db } from '@/database/db';
import { uid } from '@/utils/id';
import type { Flow } from '@/models';

export interface Suggestion {
  categoryId?: string;
  subcategoryId?: string;
  accountId?: string;
  personId?: string;
  profileId?: string;
}

// Normalize only harmless input differences. Do not fuzzy-match different item names:
// a false positive would silently assign the wrong category/account.
function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\\s+/g, ' ');
}

export async function suggest(text: string, flow: Flow = 'expense'): Promise<Suggestion> {
  const name = normalizeName(text);
  if (!name) return {};

  const profiles = await db.itemProfiles.toArray();
  const exact = profiles.filter((profile) => normalizeName(profile.name) === name);
  const profile = exact
    .filter((item) => item.flow === flow)
    .sort((a, b) => b.useCount - a.useCount || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0]
    // Legacy profiles without a flow remain usable only when there is no
    // flow-specific profile for this exact description.
    ?? exact
      .filter((item) => !item.flow)
      .sort((a, b) => b.useCount - a.useCount || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];

  return profile
    ? {
        categoryId: profile.categoryId,
        subcategoryId: profile.subcategoryId,
        accountId: profile.accountId,
        personId: profile.personId,
        profileId: profile.id,
      }
    : {};
}

export async function learnFromTransaction(transaction: {
  description: string;
  categoryId: string;
  subcategoryId?: string;
  accountId: string;
  personId?: string;
  amount: number;
  flow: Flow;
}) {
  const name = transaction.description.trim();
  const normalizedName = normalizeName(name);
  if (!normalizedName) return;

  const profiles = await db.itemProfiles.toArray();
  const existing = profiles
    .filter((profile) => normalizeName(profile.name) === normalizedName)
    .filter((profile) => profile.flow === transaction.flow || !profile.flow)
    .sort((a, b) => {
      // Prefer a profile already scoped to this flow; otherwise upgrade a legacy profile.
      const flowPriority = Number(Boolean(b.flow)) - Number(Boolean(a.flow));
      return flowPriority || b.useCount - a.useCount || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
    })[0];

  const learned = {
    categoryId: transaction.categoryId,
    subcategoryId: transaction.subcategoryId,
    accountId: transaction.accountId,
    personId: transaction.personId,
    amount: transaction.amount,
    flow: transaction.flow,
    lastUsedAt: Date.now(),
  };

  if (existing) {
    await db.itemProfiles.update(existing.id, {
      ...learned,
      useCount: existing.useCount + 1,
    });
  } else {
    await db.itemProfiles.add({
      id: uid(),
      name,
      ...learned,
      useCount: 1,
    });
  }
}
