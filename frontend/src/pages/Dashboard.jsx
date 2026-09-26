import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import PortCard from '../components/PortCard';

export default function Dashboard() {
  const { token, username, logout } = useAuth();
  const [ports, setPorts] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [connError, setConnError] = useState('');

  useEffect(() => {
    const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      auth: { token },
    });

    socket.on('connect_error', () => setConnError('Gagal terhubung ke server real-time'));
    socket.on('ports:update', (data) => {
      setConnError('');
      setPorts(data.ports || []);
      setLastUpdate(data.timestamp);
    });
    socket.on('ports:error', (data) => setConnError(data.message));

    return () => socket.disconnect();
  }, [token]);

  const summary = useMemo(() => {
    const up = ports.filter((p) => p.status === 'up').length;
    return { total: ports.length, up, down: ports.length - up };
  }, [ports]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Mikrotik Switch Monitor</h1>
          {lastUpdate && (
            <p className="last-update">
              Update terakhir: {new Date(lastUpdate).toLocaleTimeString('id-ID')}
            </p>
          )}
        </div>
        <div className="header-right">
          <span className="username-badge">{username}</span>
          <button className="logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      {connError && <div className="conn-error-banner">{connError}</div>}

      <div className="summary-bar">
        <div className="summary-item">
          <span className="summary-value">{summary.total}</span>
          <span className="summary-label">Total Port</span>
        </div>
        <div className="summary-item up">
          <span className="summary-value">{summary.up}</span>
          <span className="summary-label">ON</span>
        </div>
        <div className="summary-item down">
          <span className="summary-value">{summary.down}</span>
          <span className="summary-label">OFF</span>
        </div>
      </div>

      <div className="port-grid">
        {ports.length === 0 ? (
          <p className="empty-state">Menunggu data dari switch...</p>
        ) : (
          ports.map((port) => <PortCard key={port.interfaceName} port={port} />)
        )}
      </div>
    </div>
  );
}
