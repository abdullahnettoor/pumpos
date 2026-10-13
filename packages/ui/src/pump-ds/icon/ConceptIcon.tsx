import React from 'react';
import { Icon, type IconSize } from './Icon.js';
import { CONCEPT_ICON, type Concept } from './concepts.js';

/** The concept's one icon (see `CONCEPT_ICON`). Tabs use `xs` (14px). */
export const ConceptIcon: React.FC<{ concept: Concept; size?: IconSize }> = ({
  concept,
  size = 'xs',
}) => <Icon name={CONCEPT_ICON[concept]} size={size} />;
