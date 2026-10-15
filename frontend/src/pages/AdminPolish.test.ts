// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import AdminReports from './AdminReports';
import AdminFunds from './AdminFunds';
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), toggle: vi.fn(), report: vi.fn() }));
vi.mock('../hooks/useSignOut', () => ({ useSignOut: () => mocks.signOut }));
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ session: { user: { id: 'self' } } }) }));
vi.mock('../hooks/useAdminUsers', () => ({ useAdminUsers: () => {
 const users = [true, false].map((is_active, i) => ({ id: String(i), email: `user${i}@example.com`, first_name: 'User', last_name: String(i), role: 'user', is_active }));
 return { users, filteredUsers: users, loading: false, search: '', setSearch: vi.fn(), toggleUserStatus: mocks.toggle };
} }));
vi.mock('../hooks/useAdminReports', () => ({ useAdminReport: (...args: unknown[]) => { mocks.report(...args); return { data: null, loading: true, error: null }; } }));
vi.mock('../services/api/adminFundCatalogue', () => ({ listAdminFunds: async () => ({ funds: [], count: 0 }), updateAdminFund: vi.fn() }));
vi.mock('../components/admin/AddFundForm', () => ({ default: () => null }));
let container: HTMLDivElement, root: Root;
beforeEach(() => {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
 vi.clearAllMocks(); mocks.toggle.mockResolvedValue(false);
 container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function mount(Component: typeof AdminDashboard) {
 await act(async () => root.render(createElement(MemoryRouter, {}, createElement(Component))));
}
it('labels status actions by destination and preserves the toggle arguments', async () => {
 await mount(AdminDashboard);
 const inactive = container.querySelector('button[aria-label="Set account Inactive"]') as HTMLButtonElement;
 const active = container.querySelector('button[aria-label="Set account Active"]') as HTMLButtonElement;
 expect(inactive.textContent?.trim()).toBe('Inactive'); expect(active.textContent?.trim()).toBe('Active');
 await act(async () => inactive.click()); expect(mocks.toggle).toHaveBeenLastCalledWith('0', false);
 await act(async () => active.click()); expect(mocks.toggle).toHaveBeenLastCalledWith('1', true);
 expect(container.querySelector('button[title="Deactivate account"]')).toBeNull();
});
it('shows Reports sign out using the existing hook and preserves filters', async () => {
 await mount(AdminReports);
 const buttons = () => [...container.querySelectorAll('button')];
 const signOut = buttons().find(button => button.textContent?.trim() === 'Sign out')!;
 expect(signOut).toBeTruthy(); await act(async () => signOut.click()); expect(mocks.signOut).toHaveBeenCalledOnce();
 await act(async () => buttons().find(button => button.textContent === '7 days')!.click());
 expect(mocks.report.mock.calls.at(-1)?.[1]).toBe('7d');
 expect(container.querySelector('h1')?.textContent).toBe('Reports & Analytics');
});
it('keeps the fund title and admin navigation without its decorative icon', async () => {
 await mount(AdminFunds);
 const title = container.querySelector('h1')!;
 expect(title.textContent?.trim()).toBe('Fund catalogue'); expect(title.querySelector('svg')).toBeNull();
 expect([...container.querySelectorAll('a')].some(link => link.textContent === 'Users')).toBe(true);
});

it('keeps the status action disabled and clearly named while saving', async () => {
 let finish!: (ok: boolean) => void;
 mocks.toggle.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
 await mount(AdminDashboard);
 const action = container.querySelector('button[aria-label="Set account Inactive"]') as HTMLButtonElement;
 await act(async () => action.click());
 expect(action.disabled).toBe(true);
 expect(action.getAttribute('aria-label')).toBe('Setting account Inactive');
 expect(action.textContent).toBe('…');
 await act(async () => finish(false));
 expect(action.disabled).toBe(false);
 expect(action.textContent?.trim()).toBe('Inactive');
});
