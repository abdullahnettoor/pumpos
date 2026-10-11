import React from 'react';
import { useShell } from './context.js';
import { useDecantations } from '@pump/ui';
import { DetailPage } from '../ui/index.js';
import { DecantationDetailPage } from '../screens/decantation/DecantationDetailPage.js';
import { DecantationsListPage } from '../screens/decantation/DecantationsListPage.js';
import { FinishUnloadingPage } from '../screens/decantation/FinishUnloadingPage.js';

/** Bridges attention rows to the mobile Decantations list and visit screens. */
export const DecantationsAttentionTarget: React.FC<{ decantationId?: string }> = ({
  decantationId,
}) => {
  const { station } = useShell();
  const q = useDecantations(station?.id);

  if (!station) {
    return (
      <DetailPage title="Decantations">
        <p className="mx-3 p-3 text-sm text-text-muted">Choose a station to view Decantations.</p>
      </DetailPage>
    );
  }

  if (!decantationId) return <DecantationsListPage station={station} />;
  const record = q.data?.find((item) => item.id === decantationId);
  if (!record) {
    return (
      <DetailPage title="Decantations" subtitle={station.name}>
        <p className="mx-3 mt-3 text-sm text-text-muted">
          {q.isLoading ? 'Loading Decantations…' : 'This Decantation is not available.'}
        </p>
      </DetailPage>
    );
  }

  if (record.status === 'DRAFT') {
    return <FinishUnloadingPage station={station} decantation={record} />;
  }
  return <DecantationDetailPage station={station} decantationId={record.id} />;
};
