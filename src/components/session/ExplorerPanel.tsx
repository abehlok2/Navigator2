import type { CSSProperties } from 'react';

import { Card } from '../ui';

const contentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

export const ExplorerPanel = () => {
  return (
    <Card title="Explorer Console">
      <div style={contentStyles}>
        <p style={{ margin: 0 }}>
          Explorer tools are coming in Phase 2. This section will show microphone routing, incoming
          audio monitoring, and recording controls when ready.
        </p>
      </div>
    </Card>
  );
};

ExplorerPanel.displayName = 'ExplorerPanel';

export default ExplorerPanel;
