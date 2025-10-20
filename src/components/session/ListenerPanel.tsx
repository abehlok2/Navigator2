import type { CSSProperties } from 'react';

import { Card } from '../ui';

const contentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

export const ListenerPanel = () => {
  return (
    <Card title="Listener View">
      <div style={contentStyles}>
        <p style={{ margin: 0 }}>
          Listener-specific tools will arrive in Phase 2. For now, stay connected to hear the
          facilitator and explorers as features roll out.
        </p>
      </div>
    </Card>
  );
};

ListenerPanel.displayName = 'ListenerPanel';

export default ListenerPanel;
