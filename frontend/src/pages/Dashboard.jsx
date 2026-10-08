import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import PortCard from '../components/PortCard';
import api from '../api/axios';

function mergeEvents(current, incoming) {
  const unique = new Map([...incoming, ...current].map((event) => [event.id, event]));
  return [...unique.values()]
    .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at))
    .slice(0, 30);
}

export default function Dashboard() {
  const { token, username, logout } = useAuth();
  const [ports, setPorts] = useState([]);
  const [events, setEvents] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [connError, setConnError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/api/switches/events?limit=30')
      .then(({ data }) => {
        if (active) setEvents((current) => mergeEvents(current, data.events || []));
      })
      .catch(() => {});

    const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
      auth: { token },
    });

    socket.on('connect_error', () => setConnError('Gagal terhubung ke server real-time'));
    socket.on('ports:update', (data) => {
      setConnError('');
      setPorts(data.ports || []);
      setLastUpdate(data.timestamp);
    });
    socket.on('events:new', (data) => {
      setEvents((current) => mergeEvents(current, data.events || []));
    });
    socket.on('ports:error', (data) => setConnError(data.message));

    return () => {
      active = false;
      socket.disconnect();
    };
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

      <section className="events-panel" aria-label="Log kejadian real-time">
        <div className="events-header">
          <h2>Log kejadian</h2>
          <span>{events.length} terbaru</span>
        </div>
        {events.length === 0 ? (
          <p className="empty-state">Belum ada kejadian yang tercatat.</p>
        ) : (
          <ul className="events-list">
            {events.map((event) => (
              <li className="event-row" key={event.id}>
                <span className={`event-indicator event-${event.event_type}`} aria-hidden="true" />
                <span className="event-message">{event.message}</span>
                <time dateTime={event.recorded_at}>
                  {new Date(event.recorded_at).toLocaleString('id-ID')}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

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
