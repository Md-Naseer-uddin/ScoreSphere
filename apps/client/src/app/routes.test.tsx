import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('routes', () => {
  it('redirects / to the app home', async () => {
    const router = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Ready to score' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('shows the five bottom-navigation destinations', async () => {
    renderAt('/app');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    for (const label of ['Home', 'Sports', 'Matches', 'Teams', 'Profile']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('lists all 12 sports', async () => {
    renderAt('/app/sports');
    await screen.findByRole('heading', { name: 'Sports' });
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('main'))).toHaveLength(12);
    expect(screen.getByText('Kho-Kho')).toBeInTheDocument();
  });

  it('renders a not-found page for unknown paths', async () => {
    renderAt('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
