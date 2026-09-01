import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppProvider } from '@/context/AppContext';
import Header from '@/components/Header';

export function Layout() {
  return (
    <AppProvider>
      <div className="flex flex-col min-h-screen bg-background">
        <Header />
        <main className="flex-1 min-h-0">
          <Outlet />
        </main>
      </div>
      <Toaster position="top-right" closeButton />
    </AppProvider>
  );
}
