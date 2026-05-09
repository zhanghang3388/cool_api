import { Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import Sidebar from './Sidebar';

export default function AdminLayout() {
  const { data: user } = useCurrentUser();

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-dots">
      <Sidebar user={user} />
      <main className="ml-60 flex-1 overflow-y-auto scrollbar-thin p-6">
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
