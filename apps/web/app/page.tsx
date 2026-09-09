const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ReadyState = { database: boolean; cache: boolean } | null;

async function fetchReadiness(): Promise<ReadyState> {
  try {
    const response = await fetch(`${API_URL}/health/ready`, { cache: 'no-store' });
    const payload = (await response.json()) as { data?: ReadyState };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const readiness = await fetchReadiness();

  const services: Array<{ name: string; up: boolean }> = [
    { name: 'API server', up: readiness !== null },
    { name: 'PostgreSQL', up: readiness?.database ?? false },
    { name: 'Redis', up: readiness?.cache ?? false },
  ];

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: 'var(--space-xxxl) var(--space-xl)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-text-muted)',
        }}
      >
        MMA301 · Group 2
      </p>

      <h1 style={{ margin: 'var(--space-sm) 0 0', fontSize: 36, lineHeight: 1.15 }}>
        Project shell
      </h1>

      <p style={{ marginTop: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
        Shared infrastructure is in place. Pick a topic and the feature work drops into the
        existing server, mobile, and web workspaces.
      </p>

      <section
        style={{
          marginTop: 'var(--space-xxl)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        <h2
          style={{
            margin: 0,
            padding: 'var(--space-lg)',
            fontSize: 14,
            fontWeight: 600,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          Service status
        </h2>

        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {services.map((service, index) => (
            <li
              key={service.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-md) var(--space-lg)',
                borderTop: index === 0 ? 'none' : '1px solid var(--color-border)',
              }}
            >
              <span>{service.name}</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  color: service.up ? 'var(--color-success)' : 'var(--color-text-muted)',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: service.up ? 'var(--color-success)' : 'var(--color-border)',
                  }}
                />
                {service.up ? 'Up' : 'Down'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {readiness === null && (
        <p style={{ marginTop: 'var(--space-lg)', fontSize: 14, color: 'var(--color-text-muted)' }}>
          Server unreachable at {API_URL}. Start it with <code>npm run docker:up</code>.
        </p>
      )}
    </main>
  );
}
