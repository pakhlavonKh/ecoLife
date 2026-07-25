import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const NAV = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/bookings', label: 'Бронирования' },
  { to: '/calendar', label: 'Шахматка' },
  { to: '/customers', label: 'Клиенты' },
  { to: '/inventory', label: 'Номера' },
  { to: '/audit', label: 'Журнал' },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-[var(--line)] bg-[var(--surface)] lg:border-b-0 lg:border-r">
        <div className="px-5 py-5">
          <div className="text-lg font-semibold tracking-tight text-[var(--accent)]">
            EcoLife
          </div>
          <div className="text-xs text-[var(--muted)]">Админ-панель</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-md px-3 py-2 text-sm transition',
                  isActive
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-[var(--line)] px-5 py-4 lg:block">
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-[var(--muted)]">{user?.email}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 text-sm text-[var(--danger)] hover:underline"
          >
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur lg:hidden">
          <div className="text-sm text-[var(--muted)]">{user?.name}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="text-sm text-[var(--danger)]"
          >
            Выйти
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
