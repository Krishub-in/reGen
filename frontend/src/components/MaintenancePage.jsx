import React from 'react';

// Simple SVG icon to avoid external dependency issues
function AlertIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-12 h-12 text-red-500"
    >
      <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.696.466l8.25 18a.75.75 0 01-.696 1.034H3.75a.75.75 0 01-.696-1.034l8.25-18A.75.75 0 0112 2.25zm0 5.25a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0V8.25a.75.75 0 00-.75-.75zm0 8.25a.875.875 0 100 1.75.875.875 0 000-1.75z" clipRule="evenodd" />
    </svg>
  );
}

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(220,38,38,0.1),transparent)] pointer-events-none" />
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="mx-auto bg-red-500/10 w-24 h-24 rounded-3xl flex items-center justify-center mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
          <AlertIcon />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tighter text-white">Server Under Maintenance</h1>
          <p className="text-zinc-300 text-sm leading-relaxed">
            Our services are currently undergoing maintenance to enhance performance and security.
            <br />
            We appreciate your patience and will be back online shortly.
          </p>
        </div>
        <div className="pt-8 border-t border-zinc-800">
          <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold">Estimated downtime: <span className="text-red-400">under 15 minutes</span></p>
        </div>
      </div>
    </div>
  );
}
