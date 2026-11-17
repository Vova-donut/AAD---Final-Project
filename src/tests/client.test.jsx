// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuthForm from '../client/components/AuthForm.jsx';
import RecordList from '../client/components/RecordList.jsx';
import { api, getAll } from '../client/lib/api.js';
import { decodeKey } from '../client/lib/push.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('client behaviour', () => {
  it('switches from sign-in to registration and validates required name', () => {
    render(<AuthForm onLogin={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('New here? Create an account'));
    expect(screen.getByLabelText('Your name')).toBeRequired();
    expect(screen.getByRole('heading', { name: 'Start your planner' })).toBeInTheDocument();
  });
  it('displays API errors without signing in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid email or password' } }),
      }),
    );
    const login = vi.fn();
    render(<AuthForm onLogin={login} />);
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: 'incorrect-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(login).not.toHaveBeenCalled();
  });
  it('disables edit and delete in an offline list', () => {
    render(
      <RecordList
        kind="tasks"
        items={[
          {
            _id: '1',
            title: 'Private work',
            course: 'AAD',
            dueDate: '2026-11-25',
            priority: 'high',
            status: 'todo',
          },
        ]}
        disabled
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Edit Private work' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Private work' })).toBeDisabled();
  });
  it('delegates edit and delete for the selected record', () => {
    const onEdit = vi.fn(),
      onDelete = vi.fn();
    const record = {
      _id: '1',
      title: 'API practice',
      course: 'AAD',
      startAt: '2026-11-24T10:00:00Z',
      duration: 45,
      status: 'planned',
    };
    render(<RecordList kind="sessions" items={[record]} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit API practice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete API practice' }));
    expect(onEdit).toHaveBeenCalledWith(record);
    expect(onDelete).toHaveBeenCalledWith(record);
  });
  it('returns no body for 204 and surfaces field validation details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ status: 204 })
        .mockResolvedValueOnce({
          status: 400,
          ok: false,
          json: async () => ({ error: { details: [{ field: 'duration', message: 'Too small' }] } }),
        }),
    );
    expect(await api('/tasks/1', { method: 'DELETE' })).toBeNull();
    await expect(api('/sessions', { method: 'POST', body: {} })).rejects.toThrow(
      'duration: Too small',
    );
  });
  it('loads all paginated records', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: [{ _id: '1' }], pageSize: 1 }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ data: [], pageSize: 1 }),
      });
    vi.stubGlobal('fetch', fetch);
    expect(await getAll('tasks')).toEqual([{ _id: '1' }]);
    expect(fetch.mock.calls[1][0]).toBe('/api/tasks?page=2');
  });
  it('decodes the VAPID public key', () => {
    expect([...decodeKey('AQID')]).toEqual([1, 2, 3]);
  });
});
