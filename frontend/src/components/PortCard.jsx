export default function PortCard({ port }) {
  const isUp = port.status === 'up';

  return (
    <div className={`port-card ${isUp ? 'port-up' : 'port-down'}`}>
      <div className="port-card-header">
        <span className="port-name">{port.interfaceName}</span>
        <span className={`status-badge ${isUp ? 'badge-up' : 'badge-down'}`}>
          {isUp ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="port-card-row">
        <span className="label">PoE</span>
        <span className={port.poeSupported ? 'poe-yes' : 'poe-no'}>
          {port.poeSupported ? 'Didukung' : 'Tidak didukung'}
        </span>
      </div>

      <div className="port-card-row traffic-row">
        <div>
          <span className="label">TX</span>
          <span className="traffic-value tx">{port.txMbps.toFixed(2)} Mbps</span>
        </div>
        <div>
          <span className="label">RX</span>
          <span className="traffic-value rx">{port.rxMbps.toFixed(2)} Mbps</span>
        </div>
      </div>

      <div className="port-card-devices">
        <span className="label">Device terhubung</span>
        {port.devices.length === 0 ? (
          <span className="no-device">Tidak ada</span>
        ) : (
          <ul>
            {port.devices.map((d, index) => (
              <li key={d.mac || `${d.name}-${index}`}>
                <span className="device-name">{d.name || 'Unknown device'}</span>
                {d.mac && <span className="device-mac">{d.mac}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
