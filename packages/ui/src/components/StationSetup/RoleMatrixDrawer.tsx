import React from 'react';
import { roleMatrix, ROLES } from '@pump/shared';
import { Drawer } from '../Drawer.js';
import { Icon } from '../../pump-ds/index.js';

/** Read-only "What each role can do", generated from the catalogue. */
export const RoleMatrixDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const rows = roleMatrix();
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="What each role can do"
      subtitle="Default Permissions. An Owner can change them per member."
      widthVariant="wide"
    >
      <table className="w-full text-[12px]" aria-label="Role permission matrix">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-1 pr-2 font-semibold">Permission</th>
            {ROLES.map((r) => (
              <th key={r} className="px-1 py-1 text-center font-semibold">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <React.Fragment key={row.id}>
              {(i === 0 || rows[i - 1].def.area !== row.def.area) && (
                <tr>
                  <th
                    colSpan={ROLES.length + 1}
                    className="pt-3 text-left text-[12px] uppercase text-ink-muted"
                  >
                    {row.def.area}
                  </th>
                </tr>
              )}
              <tr className="border-t border-border-soft">
                <td className="py-1 pr-2 text-ink-default">{row.def.label}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-1 py-1 text-center">
                    {row.roles[r] ? (
                      <Icon name="check" size="xs" aria-label={`${r} can`} />
                    ) : (
                      <span className="text-ink-muted" aria-label={`${r} cannot`}>
                        –
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </Drawer>
  );
};
