import React from 'react';
import { Button, EmptyState, Icon } from '../pump-ds/index.js';
import { openExternal } from '../utils/platform.js';
import {
  LOCKED_ASK_LINE,
  PUMPOS_CONTACT_EMAIL,
  lockedPlanLine,
  pumposContactHref,
} from './lockedFeatureState.js';

/** What a locked feature is: its name and one line on what it does. */
export interface LockedFeatureInfo {
  title: string;
  description: string;
}

export type LockedFeatureProps = LockedFeatureInfo &
  (
    | {
        /** An Owner or Manager: the plan, and Contact us. */
        variant: 'upgrade';
        /** The Organization's plan name (`Core`), when known. */
        plan: string | null;
      }
    | {
        /** Any other Role: whom to ask, and nothing commercial. */
        variant: 'ask';
      }
  );

/**
 * The locked-feature screen (#605): a centred lock, the feature's name, one
 * line on what it does, then either the plan and "Contact us" (Owners and
 * Managers) or "Ask your Owner or Manager to enable it" (everyone else).
 * Which one is decided by `lockedFeatureState` from the role-filtered Access
 * Document, never by this component.
 */
export const LockedFeature: React.FC<LockedFeatureProps> = (props) => {
  const { title, description } = props;
  return (
    <section aria-label={`${title} is locked`} className="flex justify-center py-10">
      <EmptyState
        icon={<Icon name="lock" />}
        title={title}
        description={
          <span className="flex flex-col gap-1">
            <span>{description}</span>
            <span className="text-ink-default">
              {props.variant === 'upgrade' ? lockedPlanLine(props.plan) : LOCKED_ASK_LINE}
            </span>
          </span>
        }
        action={
          props.variant === 'upgrade' ? (
            <span className="flex flex-col items-center gap-1.5">
              <Button
                variant="primary"
                size="sm"
                onClick={() => openExternal(pumposContactHref(title))}
              >
                Contact us
              </Button>
              <span className="text-[12px] text-ink-muted">or write to {PUMPOS_CONTACT_EMAIL}</span>
            </span>
          ) : undefined
        }
      />
    </section>
  );
};
