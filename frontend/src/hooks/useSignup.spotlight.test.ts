// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useSignup } from './useSignup';
import { SPOTLIGHT_KEY } from '../utils/spotlightTour';
const mocks = vi.hoisted(() => ({ signUp: vi.fn(), navigate: vi.fn(), setSession: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signUp: mocks.signUp } } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../store/authStore', () => ({ useAuthStore: () => ({ setSession: mocks.setSession }) }));
it('invites future registrations through metadata, including email-confirmation signup', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.signUp.mockResolvedValue({ data: { user: { id: 'new' }, session: null }, error: null });
  let hook!: ReturnType<typeof useSignup>;
  function Harness() { hook = useSignup(); return null; }
  const container = document.createElement('div'); const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => hook.setFormData({ firstName: 'Ada', lastName: 'Test', email: 'ada@example.com', password: 'ValidPass123!', confirmPassword: 'ValidPass123!' }));
    await act(async () => hook.handleSubmit({ preventDefault: vi.fn() } as any));
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { data: {
      first_name: 'Ada', last_name: 'Test', role: 'user', [SPOTLIGHT_KEY]: 'eligible',
    } } }));
    expect(hook.successMessage).toContain('confirmation link');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
});
