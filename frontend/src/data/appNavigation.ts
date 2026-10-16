import { LayoutDashboard, CandlestickChart, Newspaper, Landmark, Columns2, BookOpen, Calculator, Eye, Sparkles, Waves, Settings } from 'lucide-react';
import { FUNDS_ENABLED } from '../utils/fundsFlags';
import { COMPARE_ENABLED } from '../utils/compareFlags';
import { MACRO_NEWS_ENABLED } from '../utils/macroNewsFlags';

export type NavigationFlags = { funds: boolean; compare: boolean; news: boolean };
// Shared displayed order and stable route IDs for both navigation and the tour.
// Portfolio is not in the current navigation allow-list; its route is unchanged.
const NAVIGATION = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, tourCopy: 'Your home for market insights, analysis and activity.' },
  { name: 'Stocks', path: '/assets', icon: CandlestickChart, tourCopy: 'Explore stock analysis and the evidence behind each result.' },
  { name: 'Market News', path: '/news', icon: Newspaper, feature: 'news', tourCopy: 'Discover market stories and understand why they may matter.' },
  { name: 'Funds', path: '/funds', icon: Landmark, feature: 'funds', tourCopy: 'Browse investment funds and explore matches based on your profile.' },
  { name: 'Compare', path: '/compare', icon: Columns2, feature: 'compare', tourCopy: 'Compare investments side by side.' },
  { name: 'Learning', path: '/learning', icon: BookOpen, tourCopy: 'Build your financial knowledge with accessible learning resources.' },
  { name: 'Financial Tools', path: '/financial-tools', icon: Calculator, tourCopy: 'Explore practical calculators and financial concepts.' },
  { name: 'Watchlist', path: '/watchlist', icon: Eye, tourCopy: 'Keep track of stocks you’re interested in.' },
  { name: 'Ask AlphaSwarm', path: '/ask', icon: Sparkles, tourCopy: 'Ask questions and explore financial topics with AlphaSwarm.' },
  { name: 'Whale Watching', path: '/whale-watching', icon: Waves, tourCopy: 'Research reported insider transactions and institutional holdings.' },
  { name: 'Settings', path: '/settings', icon: Settings, tourCopy: 'Manage your preferences, profile and account.' },
] satisfies Array<{ name: string; path: string; icon: typeof LayoutDashboard; tourCopy: string; feature?: keyof NavigationFlags }>;
export function getVisibleNavigation(flags: NavigationFlags = { funds: FUNDS_ENABLED, compare: COMPARE_ENABLED, news: MACRO_NEWS_ENABLED }) {
  return NAVIGATION.filter(item => !item.feature || flags[item.feature]);
}
