import { useEffect } from 'react'
import { AppProvider, useApp } from './state/app'
import { ToastProvider } from './state/toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ensureSeed } from './db/repo'
import { requestPersistentStorage } from './media/store'
import { startSync } from './sync/engine'
import { Library } from './screens/Library'
import { NewDish } from './screens/NewDish'
import { DishDetail } from './screens/DishDetail'
import { Cooking } from './screens/Cooking'
import { Timeline } from './screens/Timeline'

function Router() {
  const { route } = useApp()
  switch (route.name) {
    case 'library':
      return <Library />
    case 'newdish':
      return <NewDish />
    case 'dish':
      return <DishDetail dishId={route.dishId} />
    case 'cooking':
      return <Cooking sessionId={route.sessionId} />
    case 'timeline':
      return <Timeline sessionId={route.sessionId} />
  }
}

export function App() {
  useEffect(() => {
    // Seed registries on first run and ask the OS to keep the kitchen's data.
    ensureSeed().catch(() => {})
    requestPersistentStorage().catch(() => {})
    // Start the background sync loop (no-op until configured in Settings).
    startSync()
  }, [])

  return (
    <AppProvider>
      <div className="app-frame">
        <ToastProvider>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </ToastProvider>
      </div>
    </AppProvider>
  )
}
