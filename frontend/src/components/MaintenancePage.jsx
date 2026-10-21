import React from 'react';

export default function MaintenancePage() {
  return (
    <div
      id="server-maintenance-screen"
      style={{
        minHeight: '100vh',
        width: '100vw',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111111',
        color: '#ffffff',
        textAlign: 'center',
        padding: '2rem',
        boxSizing: 'border-box',
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif"
      }}
    >
      <h1
        style={{
          color: '#ffffff',
          fontSize: '2.5rem',
          fontWeight: '800',
          letterSpacing: '-0.025em',
          margin: '0 0 1rem 0'
        }}
      >
        Server Under Maintenance
      </h1>
      <p
        style={{
          color: '#ffffff',
          fontSize: '1.125rem',
          maxWidth: '520px',
          lineHeight: 1.6,
          margin: 0,
          opacity: 0.9
        }}
      >
        Our services are currently undergoing maintenance. Please check back shortly.
      </p>
    </div>
  );
}
