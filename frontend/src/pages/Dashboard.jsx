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

function localDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Dashboard() {
  const { token, username, logout } = useAuth();
  const [ports, setPorts] = useState([]);
  const [events, setEvents] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [connError, setConnError] = useState('');
  const [isEventsOpen, setIsEventsOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dayEvents, setDayEvents] = useState([]);
  const [dayEventsLoading, setDayEventsLoading] = useState(false);
  const [dayEventsError, setDayEventsError] = useState('');

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

  useEffect(() => {
    if (!isEventsOpen || !selectedDate) return undefined;

    let active = true;
    const from = new Date(`${selectedDate}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    setDayEventsLoading(true);
    setDayEventsError('');
    api.get('/api/switches/events', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then(({ data }) => {
        if (active) setDayEvents(data.events || []);
      })
      .catch(() => {
        if (active) setDayEventsError('Gagal memuat log pada tanggal ini.');
      })
      .finally(() => {
        if (active) setDayEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isEventsOpen, selectedDate]);

  const openEventsForDate = (date) => {
    setSelectedDate(localDateInputValue(date));
    setIsEventsOpen(true);
  };

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
          <button
            className="events-open-button"
            type="button"
            onClick={() => openEventsForDate(events[0] ? new Date(events[0].recorded_at) : new Date())}
          >
            Lihat per hari
          </button>
        </div>
        {events.length === 0 ? (
          <p className="empty-state">Belum ada kejadian yang tercatat.</p>
        ) : (
          <ul className="events-list">
            {events.slice(0, 5).map((event) => (
              <li key={event.id}>
                <button
                  className="event-row event-row-button"
                  type="button"
                  onClick={() => openEventsForDate(new Date(event.recorded_at))}
                  aria-label={`Lihat semua kejadian tanggal ${new Date(event.recorded_at).toLocaleDateString('id-ID')}`}
                >
                  <span className={`event-indicator event-${event.event_type}`} aria-hidden="true" />
                  <span className="event-message">{event.message}</span>
                  <time dateTime={event.recorded_at}>
                    {new Date(event.recorded_at).toLocaleString('id-ID')}
                  </time>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isEventsOpen && (
        <div
          className="events-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsEventsOpen(false);
          }}
        >
          <section className="events-modal" role="dialog" aria-modal="true" aria-labelledby="events-modal-title">
            <header className="events-modal-header">
              <div>
                <h2 id="events-modal-title">Log kejadian</h2>
                <label className="events-date-label" htmlFor="events-date">Tanggal</label>
                <input
                  id="events-date"
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                />
              </div>
              <button className="events-close-button" type="button" onClick={() => setIsEventsOpen(false)}>
                Tutup
              </button>
            </header>
            <div className="events-modal-content" aria-live="polite">
              {dayEventsLoading ? (
                <p className="empty-state">Memuat kejadian...</p>
              ) : dayEventsError ? (
                <p className="error-text">{dayEventsError}</p>
              ) : dayEvents.length === 0 ? (
                <p className="empty-state">Tidak ada kejadian pada tanggal ini.</p>
              ) : (
                <ul className="events-list">
                  {dayEvents.map((event) => (
                    <li className="event-row" key={event.id}>
                      <span className={`event-indicator event-${event.event_type}`} aria-hidden="true" />
                      <span className="event-message">{event.message}</span>
                      <time dateTime={event.recorded_at}>
                        {new Date(event.recorded_at).toLocaleTimeString('id-ID')}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}

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
