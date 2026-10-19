import { LayoutDashboard, CandlestickChart, Newspaper, Landmark, Columns2, BookOpen, Calculator, Eye, Sparkles, Waves, Settings } from 'lucide-react';
import { FUNDS_ENABLED } from '../utils/fundsFlags';
import { COMPARE_ENABLED } from '../utils/compareFlags';
import { MACRO_NEWS_ENABLED } from '../utils/macroNewsFlags';

export type NavigationFlags = { funds: boolean; compare: boolean; news: boolean };
/** Where an entry sits in the sidebar: under a group label, or pinned at the
 *  foot with the account (Ask AlphaSwarm and Settings). Dashboard has none. */
export type NavigationGroup = 'Explore' | 'Your tools' | 'Learn' | 'footer';
// Shared displayed order and stable route IDs for both navigation and the tour.
// The order is the sidebar read top to bottom, groups included, so the welcome
// tour walks it in the same order a reader's eye does.
// Portfolio is not in the current navigation allow-list; its route is unchanged.
const NAVIGATION = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, tourCopy: 'Your home for market insights, analysis and activity.' },
  { name: 'Stocks', path: '/assets', icon: CandlestickChart, group: 'Explore', tourCopy: 'Explore stock analysis and the evidence behind each result.' },
  { name: 'Funds', path: '/funds', icon: Landmark, group: 'Explore', feature: 'funds', tourCopy: 'Browse investment funds and explore matches based on your profile.' },
  { name: 'Market News', path: '/news', icon: Newspaper, group: 'Explore', feature: 'news', tourCopy: 'Discover market stories and understand why they may matter.' },
  { name: 'Whale Watching', path: '/whale-watching', icon: Waves, group: 'Explore', tourCopy: 'Research reported insider transactions and institutional holdings.' },
  { name: 'Watchlist', path: '/watchlist', icon: Eye, group: 'Your tools', tourCopy: 'Keep track of stocks you’re interested in.' },
  { name: 'Compare', path: '/compare', icon: Columns2, group: 'Your tools', feature: 'compare', tourCopy: 'Compare investments side by side.' },
  { name: 'Financial Tools', path: '/financial-tools', icon: Calculator, group: 'Your tools', tourCopy: 'Explore practical calculators and financial concepts.' },
  { name: 'Learning', path: '/learning', icon: BookOpen, group: 'Learn', tourCopy: 'Build your financial knowledge with accessible learning resources.' },
  { name: 'Ask AlphaSwarm', path: '/ask', icon: Sparkles, group: 'footer', tourCopy: 'Ask questions and explore financial topics with AlphaSwarm.' },
  { name: 'Settings', path: '/settings', icon: Settings, group: 'footer', tourCopy: 'Manage your preferences, profile and account.' },
] satisfies Array<{ name: string; path: string; icon: typeof LayoutDashboard; tourCopy: string; group?: NavigationGroup; feature?: keyof NavigationFlags }>;
export type NavigationItem = (typeof NAVIGATION)[number];
export function getVisibleNavigation(flags: NavigationFlags = { funds: FUNDS_ENABLED, compare: COMPARE_ENABLED, news: MACRO_NEWS_ENABLED }) {
  return NAVIGATION.filter(item => !item.feature || flags[item.feature]);
}
/** The visible entries as the sidebar draws them: runs of the same group, in
 *  order, each with the label shown above it (none for Dashboard or the foot). */
export function groupNavigation(items: NavigationItem[]) {
  const sections: { group: NavigationGroup | null; items: NavigationItem[] }[] = [];
  for (const item of items) {
    const group = ('group' in item ? item.group : undefined) ?? null;
    const last = sections[sections.length - 1];
    if (last && last.group === group) last.items.push(item);
    else sections.push({ group, items: [item] });
  }
  return sections;
}
