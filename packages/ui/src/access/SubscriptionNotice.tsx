import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAccess } from '../query/hooks.js';
import { Banner } from '../components/primitives/Banner.js';

/**
 * Persistent subscription notice.
 *
 * The server has already decided what this user may be told: Owners and
 * Managers receive the billing detail and the action that resolves it, while
 * everyone else receives only the operational fact that access is limited and
 * who to talk to. This renders whatever the Access Document says, so the copy
 * and the audience stay one server-side decision.
 *
 * Nothing shows while the subscription is healthy, and nothing shows on a cold
 * start — a client with no document says nothing rather than guessing.
 */
export const SubscriptionNotice: React.FC = () => {
  const { data: access } = useAccess();
  const subscription = access?.subscription;
  if (!subscription?.showWarning || !subscription.warningMessage) return null;

  // Restricted or Suspended is already biting; a grace-period warning is not.
  const severity = subscription.mode === 'NORMAL' ? 'warning' : 'danger';

  return (
    <Banner
      severity={severity}
      icon={<AlertTriangle size={15} />}
      style={{ marginBottom: 'var(--space-4)' }}
    >
      {subscription.warningMessage}
    </Banner>
  );
};
