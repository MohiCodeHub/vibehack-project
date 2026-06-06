import { SocketProvider, useGame } from './lib/socket.tsx';
import { ToastProvider } from './components/Toast.tsx';
import { Home } from './screens/Home.tsx';
import { Lobby } from './screens/Lobby.tsx';
import { Selecting } from './screens/Selecting.tsx';
import { Answering } from './screens/Answering.tsx';
import { Voting } from './screens/Voting.tsx';
import { Leaderboard } from './screens/Leaderboard.tsx';
import { Final } from './screens/Final.tsx';
import { ConnBadge } from './components/ConnBadge.tsx';

function Router() {
  const { room } = useGame();
  if (!room) return <Home />;
  switch (room.phase) {
    case 'lobby':
      return <Lobby />;
    case 'selecting':
      return <Selecting />;
    case 'answering':
      return <Answering />;
    case 'voting':
      return <Voting />;
    case 'leaderboard':
      return <Leaderboard />;
    case 'final':
      return <Final />;
    default:
      return <Home />;
  }
}

export function App() {
  return (
    <SocketProvider>
      <ToastProvider>
        <div className="app-shell">
          <ConnBadge />
          <Router />
        </div>
      </ToastProvider>
    </SocketProvider>
  );
}
