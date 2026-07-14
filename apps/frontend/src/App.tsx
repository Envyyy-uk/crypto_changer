import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { clearTokens, isLoggedIn } from './api/client';
import LoginPage from './pages/LoginPage';
import MarketsPage from './pages/MarketsPage';
import OrdersPage from './pages/OrdersPage';
import RegisterPage from './pages/RegisterPage';
import TradePage from './pages/TradePage';
import WalletPage from './pages/WalletPage';

function Navbar() {
  const navigate = useNavigate();
  const loggedIn = isLoggedIn();

  return (
    <nav className="nav">
      <NavLink to="/markets" className="logo">
        CX
      </NavLink>
      <NavLink to="/markets" className={({ isActive }) => `link${isActive ? ' active' : ''}`}>
        Markets
      </NavLink>
      <NavLink to="/trade/BTCUSDT" className={({ isActive }) => `link${isActive ? ' active' : ''}`}>
        Trade
      </NavLink>
      <NavLink to="/wallet" className={({ isActive }) => `link${isActive ? ' active' : ''}`}>
        Wallet
      </NavLink>
      <NavLink to="/orders" className={({ isActive }) => `link${isActive ? ' active' : ''}`}>
        Orders
      </NavLink>
      <div className="spacer" />
      {loggedIn ? (
        <button
          className="btn ghost"
          onClick={() => {
            clearTokens();
            navigate('/login');
          }}
        >
          Log out
        </button>
      ) : (
        <>
          <NavLink to="/login" className="link">
            Log in
          </NavLink>
          <NavLink to="/register" className="btn">
            Register
          </NavLink>
        </>
      )}
    </nav>
  );
}

function RequireAuth({ children }: { children: JSX.Element }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/markets" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/trade/:symbol" element={<TradePage />} />
        <Route
          path="/wallet"
          element={
            <RequireAuth>
              <WalletPage />
            </RequireAuth>
          }
        />
        <Route
          path="/orders"
          element={
            <RequireAuth>
              <OrdersPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/markets" replace />} />
      </Routes>
    </>
  );
}
