import React from 'react';
import {
  Button,
  Icon,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '../../pump-ds/index.js';

/** One launcher in the Record menu, with the hotkey the Live shift tab listens for. */
export interface RecordAction {
  key: 'merchandise-sale' | 'expense' | 'collection' | 'purchase';
  label: string;
  hotkey: string;
  onSelect: () => void;
}

export interface ShiftsHeaderActionsProps {
  /** The Product sale launcher (a Billed Sale); shown only while a shift is open. */
  productSale: RecordAction | null;
  /** The Office Record launchers (expense, collection, purchase). */
  officeRecords: RecordAction[];
  /** The page's one primary action: Close shift, or Open shift when none is open. */
  primary: { label: string; icon: 'lock' | 'play'; onClick: () => void } | null;
}

const ICON: Record<RecordAction['key'], 'shopping-bag' | 'receipt' | 'wallet' | 'cart'> = {
  'merchandise-sale': 'shopping-bag',
  expense: 'receipt',
  collection: 'wallet',
  purchase: 'cart',
};

/**
 * The Shifts page actions (#533), the same on every tab: a Record ▾ menu (a
 * Product sale, then the Office Records) and the page's one primary button.
 * The hotkeys shown are the ones the Live shift tab already listens for.
 */
export const ShiftsHeaderActions: React.FC<ShiftsHeaderActionsProps> = ({
  productSale,
  officeRecords,
  primary,
}) => (
  <div className="flex items-center gap-2">
    {(productSale || officeRecords.length > 0) && (
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Icon name="plus" size="xs" aria-hidden="true" />}
            rightIcon={<Icon name="chevron-down" size="xs" aria-hidden="true" />}
          >
            Record
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="min-w-[220px]">
          {productSale && (
            <MenuItem
              icon={<Icon name={ICON[productSale.key]} size="sm" />}
              shortcut={productSale.hotkey}
              onSelect={productSale.onSelect}
            >
              {productSale.label}
            </MenuItem>
          )}
          {productSale && officeRecords.length > 0 && <MenuSeparator />}
          {officeRecords.length > 0 && (
            <MenuLabel className="font-sans text-[12px] normal-case tracking-normal">
              Office record
            </MenuLabel>
          )}
          {officeRecords.map((a) => (
            <MenuItem
              key={a.key}
              icon={<Icon name={ICON[a.key]} size="sm" />}
              shortcut={a.hotkey}
              onSelect={a.onSelect}
            >
              {a.label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
    )}
    {primary && (
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Icon name={primary.icon} size="xs" aria-hidden="true" />}
        onClick={primary.onClick}
      >
        {primary.label}
      </Button>
    )}
  </div>
);
