import { beforeEach, expect, it, vi } from 'vitest';
import { SPOTLIGHT_KEY } from '../../utils/spotlightTour';
const mocks = vi.hoisted(() => ({ id: 'new', metadata: {} as Record<string, unknown>, getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } } }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: mocks.id } }) } }));
import { claimSpotlightTour, finishSpotlightTour } from './spotlightTourService';
beforeEach(() => {
  vi.clearAllMocks(); mocks.id = 'new'; mocks.metadata = { [SPOTLIGHT_KEY]: 'eligible', first_name: 'Ada' };
  mocks.getUser.mockImplementation(async () => ({ data: { user: { id: mocks.id, user_metadata: mocks.metadata } }, error: null }));
  mocks.updateUser.mockImplementation(async ({ data }) => { mocks.metadata = { ...mocks.metadata, ...data }; return { data: { user: { id: mocks.id, user_metadata: mocks.metadata } }, error: null }; });
});
it('claims an explicit registration invitation before display and excludes it on refresh', async () => {
  expect(await claimSpotlightTour('new')).toBe(true);
  expect(mocks.updateUser).toHaveBeenCalledWith({ data: { [SPOTLIGHT_KEY]: 'started' } });
  expect(mocks.metadata.first_name).toBe('Ada');
  expect(await claimSpotlightTour('new')).toBe(false);
});
it.each([undefined, 'started', 'skipped', 'finished', 'unexpected'])('does not claim %s metadata', async value => {
  mocks.metadata = value === undefined ? {} : { [SPOTLIGHT_KEY]: value };
  expect(await claimSpotlightTour('new')).toBe(false); expect(mocks.updateUser).not.toHaveBeenCalled();
});
it.each(['skipped', 'finished'] as const)('persists %s in the existing auth metadata only', async status => {
  await claimSpotlightTour('new'); await finishSpotlightTour('new', status);
  expect(mocks.metadata[SPOTLIGHT_KEY]).toBe(status); expect(mocks.metadata.first_name).toBe('Ada');
});
it('fails closed on persistence errors', async () => {
  mocks.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') });
  await expect(claimSpotlightTour('new')).rejects.toThrow('offline');
});
it('shares a pending claim and does not write after an account change', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getUser.mockImplementation(() => new Promise(done => { resolve = done; }));
  const one = claimSpotlightTour('new'); const two = claimSpotlightTour('new'); expect(one).toBe(two);
  mocks.id = 'other'; resolve({ data: { user: { id: 'new', user_metadata: mocks.metadata } }, error: null });
  expect(await one).toBe(false); expect(mocks.updateUser).not.toHaveBeenCalled();
});
it('does not write when authoritative auth verification fails', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  await expect(claimSpotlightTour('new')).rejects.toThrow('expired'); expect(mocks.updateUser).not.toHaveBeenCalled();
});
