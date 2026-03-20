// src/features/dashboard/coin-history.tsx — Coin history view: shows earning/spending log + how to earn

import { useState, useEffect } from 'react';
import type { CoinBalance, CoinTransaction, WordStats } from '../../contracts/types';
import { coinTransactionRepo } from '../../data/repositories/coin-transaction-repo';
import { allWordsAtLeastBucket } from '../../core/spaced-rep';

interface CoinHistoryProps {
  profileId: string;
  coinBalance: CoinBalance | null;
  allStats: WordStats[];
  activeWordCount: number;
  onBack: () => void;
  onNavigate: (view: 'learning' | 'practice') => void;
  onAddWords: () => void;
}

export function CoinHistory({ profileId, coinBalance, allStats, activeWordCount, onBack, onNavigate, onAddWords }: CoinHistoryProps) {
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coinTransactionRepo.getByProfileId(profileId).then((txns) => {
      setTransactions(txns);
      setLoading(false);
    });
  }, [profileId]);

  const coins = coinBalance?.coins ?? 0;
  const totalEarned = coinBalance?.totalEarned ?? 0;
  const totalSpent = coinBalance?.totalSpent ?? 0;

  const allLearning = activeWordCount > 0 && allWordsAtLeastBucket(allStats, activeWordCount, 'learning');
  const allFamiliar = activeWordCount > 0 && allWordsAtLeastBucket(allStats, activeWordCount, 'familiar');
  const allMastered = activeWordCount > 0 && allWordsAtLeastBucket(allStats, activeWordCount, 'mastered');

  return (
    <div className="min-h-screen bg-sf-bg">
      {/* Header */}
      <div className="bg-gradient-to-br from-sf-surface via-sf-surface to-sf-surface-hover px-4 pt-3 pb-4">
        <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sf-muted hover:text-sf-secondary text-sm transition-colors mb-3"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Back</span>
          </button>

          {/* Balance display */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/20 mb-2">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-yellow-400">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
                <circle cx="12" cy="12" r="8" fill="currentColor" />
                <text x="12" y="16" textAnchor="middle" fill="#78350f" fontSize="10" fontWeight="bold">$</text>
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-yellow-400">{coins}</h1>
            <p className="text-sf-muted text-sm">coins available</p>
          </div>

          {/* Stats row */}
          <div className="flex justify-center gap-6 text-sm">
            <div className="text-center">
              <p className="font-bold text-green-400">{totalEarned}</p>
              <p className="text-sf-muted text-xs">Total earned</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-pink-400">{totalSpent}</p>
              <p className="text-sf-muted text-xs">Total spent</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg md:max-w-4xl lg:max-w-6xl mx-auto px-4 pb-6">
        {/* How to earn section */}
        <div className="mt-4 rounded-xl bg-sf-surface border border-sf-border p-4">
          <h2 className="font-bold text-sf-heading text-sm mb-3">How to Earn Coins</h2>
          <div className="space-y-3">
            <EarnRule
              icon="📚"
              title="All words Learning"
              description="Get all your active words to the Learning stage"
              reward="+1 coin"
              color="text-blue-400"
              achieved={allLearning}
              actionLabel={activeWordCount === 0 ? 'Add Words' : 'Start Learning'}
              onAction={activeWordCount === 0 ? onAddWords : () => onNavigate('learning')}
            />
            <EarnRule
              icon="🌟"
              title="All words Familiar"
              description="Get all your active words to the Familiar stage"
              reward="+1 coin"
              color="text-purple-400"
              achieved={allFamiliar}
              actionLabel={activeWordCount === 0 ? 'Add Words' : 'Start Practice'}
              onAction={activeWordCount === 0 ? onAddWords : () => onNavigate('practice')}
            />
            <EarnRule
              icon="🏆"
              title="Master a word"
              description="Get 5+ correct in a row across 3+ days"
              reward="+1 coin each"
              color="text-yellow-400"
              achieved={allMastered}
              actionLabel={activeWordCount === 0 ? 'Add Words' : 'Keep Practicing'}
              onAction={activeWordCount === 0 ? onAddWords : () => onNavigate('practice')}
            />
          </div>
        </div>

        {/* How coins are spent */}
        <div className="mt-3 rounded-xl bg-sf-surface border border-sf-border p-4">
          <h2 className="font-bold text-sf-heading text-sm mb-2">Spending Coins</h2>
          <p className="text-sf-muted text-xs">
            Coins are used to unlock spelling games. Each game costs 1 coin.
            Once all your words are mastered, games become free!
          </p>
        </div>

        {/* Transaction history */}
        <div className="mt-4">
          <h2 className="font-bold text-sf-heading text-sm mb-3">History</h2>
          {loading ? (
            <p className="text-sf-muted text-sm text-center py-4">Loading...</p>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 rounded-xl bg-sf-surface border border-sf-border">
              <p className="text-sf-muted text-sm">No transactions yet</p>
              <p className="text-sf-muted text-xs mt-1">Start practicing to earn your first coin!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((txn) => (
                <TransactionRow key={txn.id} transaction={txn} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EarnRuleProps {
  icon: string;
  title: string;
  description: string;
  reward: string;
  color: string;
  achieved?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

function EarnRule({ icon, title, description, reward, color, achieved, actionLabel, onAction }: EarnRuleProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-lg flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sf-heading text-xs">{title}</p>
          <span className={`text-xs font-bold ${color} flex-shrink-0`}>{reward}</span>
        </div>
        <p className="text-sf-muted text-xs">{description}</p>
        {achieved ? (
          <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-green-400 font-medium">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Achieved
          </span>
        ) : actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="mt-1.5 px-3 py-1 text-xs font-medium rounded-full bg-sf-primary/20 text-sf-primary hover:bg-sf-primary/30 transition-colors"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: CoinTransaction }) {
  const isEarned = transaction.amount > 0;
  const dateStr = formatDate(transaction.createdAt);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-sf-surface border border-sf-border/50 px-3 py-2.5">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
        isEarned ? 'bg-green-500/20 text-green-400' : 'bg-pink-500/20 text-pink-400'
      }`}>
        {isEarned ? '+' : '-'}{Math.abs(transaction.amount)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sf-heading text-xs font-medium truncate">{transaction.description}</p>
        <p className="text-sf-muted text-xs">{dateStr}</p>
      </div>
      <ReasonBadge reason={transaction.reason} />
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const labels: Record<string, { text: string; color: string }> = {
    'word-mastered': { text: 'Mastered', color: 'bg-yellow-500/20 text-yellow-400' },
    'all-learning': { text: 'Milestone', color: 'bg-blue-500/20 text-blue-400' },
    'all-familiar': { text: 'Milestone', color: 'bg-purple-500/20 text-purple-400' },
    'game-play': { text: 'Game', color: 'bg-pink-500/20 text-pink-400' },
  };
  const badge = labels[reason] ?? { text: reason, color: 'bg-sf-surface text-sf-muted' };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
      {badge.text}
    </span>
  );
}

function formatDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
