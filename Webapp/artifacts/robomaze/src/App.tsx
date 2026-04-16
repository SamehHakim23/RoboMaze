import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";

// Pages
import Dashboard from "@/pages/Dashboard";
import ManualControl from "@/pages/ManualControl";
import HardwareMonitor from "@/pages/HardwareMonitor";
import MazeControl from "@/pages/MazeControl";
import MazeViz from "@/pages/MazeViz";
import Settings from "@/pages/Settings";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/control" component={ManualControl} />
        <Route path="/hardware" component={HardwareMonitor} />
        <Route path="/maze-control" component={MazeControl} />
        <Route path="/maze-viz" component={MazeViz} />
        <Route path="/settings" component={Settings} />
        <Route path="/logs" component={Logs} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
