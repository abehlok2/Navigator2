import type { CSSProperties } from 'react';

import { Card } from '../ui';

const contentStyles: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  color: 'var(--text-secondary, #a0a0a0)',
};

export const FacilitatorPanel = () => {
  return (
    <Card title="Facilitator Controls">
      <div style={contentStyles}>
        <p style={{ margin: 0 }}>
          Facilitator controls coming in Phase 2. Use this area to manage background audio, routing,
          and advanced session settings once they are implemented.
        </p>
      </div>
    </Card>
  );
};

FacilitatorPanel.displayName = 'FacilitatorPanel';

export default FacilitatorPanel;
