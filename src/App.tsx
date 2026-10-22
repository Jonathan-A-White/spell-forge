// src/App.tsx: the root component: the providers and the Shell. The state is src/shell/app-context.tsx's, the screens
// are picked by src/shell/WorldSwitch.tsx from the table in src/shell/worlds.ts.
import { AppProvider } from './shell/app-context';
import { Shell } from './shell/Shell';

function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export default App;
