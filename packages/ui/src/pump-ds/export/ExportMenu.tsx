import React from 'react';
import { Button } from '../button/Button.js';
import { Icon } from '../icon/Icon.js';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../menu/Menu.js';

export interface ExportMenuProps {
  /** Download a PDF of what the bar filters. Omit to leave the item out. */
  onPdf?: () => void;
  /** Download a CSV that opens in Excel. Omit to leave the item out. */
  onCsv?: () => void;
  /** Print. Omit to leave the item out. */
  onPrint?: () => void;
  /** Nothing to export yet (no rows). */
  disabled?: boolean;
  /** Accessible name of the button when the label needs context. Default "Export". */
  'aria-label'?: string;
}

/**
 * ExportMenu (#567): one secondary `Export ▾` button with PDF, Excel (CSV) and
 * Print. An item shows only when its callback is passed; with none, nothing
 * renders. It sits at the right end of a `ControlBar` and exports what that
 * bar filters.
 *
 * Built on the pump-ds `Menu` (Radix): ↑/↓ move, Enter picks, Escape closes
 * and returns focus to the button.
 */
export function ExportMenu({
  onPdf,
  onCsv,
  onPrint,
  disabled,
  'aria-label': ariaLabel,
}: ExportMenuProps) {
  if (!onPdf && !onCsv && !onPrint) return null;
  return (
    <Menu>
      <MenuTrigger asChild disabled={disabled}>
        <Button
          variant="secondary"
          size="sm"
          aria-label={ariaLabel}
          leftIcon={<Icon name="download" size="xs" aria-hidden="true" />}
          rightIcon={<Icon name="chevron-down" size="xs" aria-hidden="true" />}
        >
          Export
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-[180px]">
        {onPdf && (
          <MenuItem icon={<Icon name="file-text" size="sm" />} onSelect={onPdf}>
            PDF
          </MenuItem>
        )}
        {onCsv && (
          <MenuItem icon={<Icon name="file" size="sm" />} onSelect={onCsv}>
            Excel (CSV)
          </MenuItem>
        )}
        {onPrint && (
          <MenuItem icon={<Icon name="printer" size="sm" />} onSelect={onPrint}>
            Print
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
