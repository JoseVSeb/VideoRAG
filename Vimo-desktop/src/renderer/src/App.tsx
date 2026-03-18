import { Route, HashRouter, Routes, Navigate } from 'react-router';
import { lazy, Suspense, useState, useEffect } from 'react';
import { Toaster } from 'sonner';

import { MainLayout } from './layouts/MainLayout';
import InitializationWizard from './components/InitializationWizard';
import { ServiceProvider } from './contexts/ServiceContext';
import { ChatSessionProvider } from './contexts/ChatSessionContext';
import './styles/globals.css';

const Chat = lazy(() => import('./pages/chat'));
const Settings = lazy(() => import('./pages/settings'));

function AppContent() {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check initialization status
  useEffect(() => {
    const checkInitialization = async () => {
      try {
        // First, check if backend config provides a storage directory
        let storeDirectory = '';
        try {
          const configResult = await window.api.videorag.getConfig();
          if (configResult.success && configResult.data?.base_storage_path) {
            storeDirectory = configResult.data.base_storage_path;
          }
        } catch {
          // Backend not reachable yet — fall through
        }

        // If we have a storage directory, check if ImageBind is installed
        if (storeDirectory) {
          try {
            const modelCheck = await window.api.checkModelFiles(storeDirectory);
            setIsInitialized(modelCheck.imagebind);
          } catch {
            setIsInitialized(false);
          }
        } else {
          // Fallback: check local settings for imagebindInstalled flag
          const result = await window.api.loadSettings();
          if (result.success && result.settings?.imagebindInstalled) {
            setIsInitialized(true);
          } else {
            setIsInitialized(false);
          }
        }
      } catch (error) {
        console.error('Failed to check initialization:', error);
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkInitialization();
  }, []);

  const handleInitializationComplete = () => {
    setIsInitialized(true);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking VideoRAG environment...</p>
        </div>
      </div>
    );
  }

  // Show initialization wizard
  if (isInitialized === false) {
    return <InitializationWizard onComplete={handleInitializationComplete} />;
  }

  // Normal application interface
  return (
    <HashRouter>
      <Suspense
        fallback={
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        }
      >
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Navigate to="/chat/new" replace />} />
            <Route path="/chat/:chatId" element={<Chat />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        <Toaster
          position="top-right"
          offset={{ top: '48px' }}
          mobileOffset={{ top: '48px' }}
        />
      </Suspense>
    </HashRouter>
  );
}

export default function App() {
  return (
    <ServiceProvider>
      <ChatSessionProvider>
        <AppContent />
      </ChatSessionProvider>
    </ServiceProvider>
  );
}
