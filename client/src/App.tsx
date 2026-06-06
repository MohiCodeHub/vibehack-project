import { AnimatePresence, motion as Motion } from 'motion/react';
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
  const screenKey = room?.phase ?? 'home';

  let content: React.ReactNode;
  if (!room) content = <Home />;
  else {
    switch (room.phase) {
      case 'lobby':
        content = <Lobby />;
        break;
      case 'selecting':
        content = <Selecting />;
        break;
      case 'answering':
        content = <Answering />;
        break;
      case 'voting':
        content = <Voting />;
        break;
      case 'leaderboard':
        content = <Leaderboard />;
        break;
      case 'final':
        content = <Final />;
        break;
      default:
        content = <Home />;
    }
  }

  return (
    <AnimatePresence mode="wait">
      <Motion.div
        key={screenKey}
        className="app-main"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        {content}
      </Motion.div>
    </AnimatePresence>
  );
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
