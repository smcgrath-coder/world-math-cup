import { AppShell } from './components/AppShell'

/**
 * The root is now nothing but the shell.
 *
 * Everything that used to live here — the gate order, a stand-in fixture list,
 * a button to reach the training ground — moved into `AppShell`, where it is
 * covered by tests rather than held together by hand.
 */
function App() {
  return <AppShell />
}

export default App
