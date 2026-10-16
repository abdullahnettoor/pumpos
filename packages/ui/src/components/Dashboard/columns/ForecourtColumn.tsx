import React from 'react';
import { shiftWorkspaceAction } from '@pump/shared';
import { principalFor } from '../../../access/effectivePrincipal.js';
import { ForecourtCard } from '../cards/ForecourtCard.js';
import { liveSubtitle } from '../cards/forecourt/derive.js';
import { useForecourtModel } from '../cards/forecourt/useForecourtModel.js';
import { SectionHeader } from '../../../pump-ds/section-header/index.js';
import { useDashboard } from '../frame/DashboardContext.js';

/** Left column: Forecourt. Its section header lives here, not in the card. */
export const ForecourtColumn: React.FC = () => {
  const { role, onNavigate } = useDashboard();
  const { model } = useForecourtModel();
  const workspace = shiftWorkspaceAction(principalFor(role));
  const subtitle =
    model?.kind === 'live'
      ? liveSubtitle(model)
      : model?.kind === 'done'
        ? 'day’s shifts done'
        : model
          ? 'no shift open'
          : undefined;
  return (
    <>
      <SectionHeader
        title="Forecourt"
        subtitle={subtitle}
        action={
          workspace === null
            ? undefined
            : {
                label: workspace === 'act' ? 'Workspace' : 'View',
                onClick: () => onNavigate('/shifts'),
              }
        }
      />
      <ForecourtCard />
    </>
  );
};
