import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { notificationCountdown } from './notificationCountdown';
import { useAnalysisNotifications } from '../store/analysisNotifications';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); useAnalysisNotifications.setState({ userId: null, ready: null, pending: null, handled: [] }); });

it('dismisses after exactly fifteen seconds', () => {
  const dismiss = vi.fn();
  notificationCountdown(dismiss);
  vi.advanceTimersByTime(14_999); expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(dismiss).toHaveBeenCalledTimes(1);
});
it('pauses on hover and resumes the remaining duration', () => {
  const dismiss = vi.fn();
  const timer = notificationCountdown(dismiss);
  vi.advanceTimersByTime(5000); timer.pause(); timer.pause();
  vi.advanceTimersByTime(30_000); expect(dismiss).not.toHaveBeenCalled();
  timer.resume(); timer.resume();
  vi.advanceTimersByTime(9999); expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(dismiss).toHaveBeenCalledTimes(1);
});
it('cleans up on unmount and gives a replacement its full duration', () => {
  const oldDismiss = vi.fn(); const newDismiss = vi.fn();
  const old = notificationCountdown(oldDismiss);
  vi.advanceTimersByTime(10_000); old.dispose();
  notificationCountdown(newDismiss);
  vi.advanceTimersByTime(14_999);
  expect(oldDismiss).not.toHaveBeenCalled(); expect(newDismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(newDismiss).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('manual dismissal cancels the countdown without changing tracking', () => {
  const pending = { runId: 'next', createdAt: 'time-2' };
  useAnalysisNotifications.setState({ userId: null, ready: 'run:time-1', pending, handled: ['run:time-1'] });
  const dismiss = vi.fn(() => useAnalysisNotifications.getState().dismiss());
  const timer = notificationCountdown(dismiss);
  timer.dispose(); dismiss(); timer.resume();
  vi.advanceTimersByTime(20_000);
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(useAnalysisNotifications.getState().ready).toBeNull();
  expect(useAnalysisNotifications.getState().pending).toBe(pending);
  expect(useAnalysisNotifications.getState().handled).toEqual(['run:time-1']);
});
it('automatic dismissal only changes visibility', () => {
  const pending = { runId: 'next', createdAt: 'time-2' };
  useAnalysisNotifications.setState({ userId: null, ready: 'run:time-1', pending, handled: ['run:time-1'] });
  notificationCountdown(useAnalysisNotifications.getState().dismiss);
  vi.advanceTimersByTime(15_000);
  expect(useAnalysisNotifications.getState().ready).toBeNull();
  expect(useAnalysisNotifications.getState().pending).toBe(pending);
  expect(useAnalysisNotifications.getState().handled).toEqual(['run:time-1']);
});
