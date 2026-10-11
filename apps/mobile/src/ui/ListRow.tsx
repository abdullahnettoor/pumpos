import React from 'react';
import { ChevronRightIcon } from './icons.js';

/** Card holding `ListRow`s, separated by hairlines. */
export const ListGroup: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <div
    className={`mx-3 overflow-hidden rounded-[14px] border border-line bg-card [&>*+*]:border-t [&>*+*]:border-line ${className}`}
  >
    {children}
  </div>
);

interface Props {
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Icon or avatar chip before the title. */
  leading?: React.ReactNode;
  /** Right-aligned value, badge or status. */
  end?: React.ReactNode;
  /** Makes the row a button and shows a chevron: it pushes a detail page. */
  onPress?: () => void;
  /** Show the chevron on a row that has `onPress` (default true). */
  chevron?: boolean;
  /** Let `meta` wrap onto further lines instead of cutting it with an ellipsis. */
  wrapMeta?: boolean;
}

/** One row of a `ListGroup`: leading, title + meta, end, chevron when it opens something. */
export const ListRow: React.FC<Props> = ({
  title,
  meta,
  leading,
  end,
  onPress,
  chevron = true,
  wrapMeta,
}) => {
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-[13px] font-semibold text-text-high">{title}</div>
        {meta && (
          <div className={`text-[11px] text-text-muted ${wrapMeta ? 'break-words' : 'truncate'}`}>
            {meta}
          </div>
        )}
      </div>
      {end && (
        <div className="flex-shrink-0 text-right text-[13.5px] font-semibold text-text-high">
          {end}
        </div>
      )}
      {onPress && chevron && (
        <span className="flex-shrink-0 text-text-faint">
          <ChevronRightIcon size={16} strokeWidth={2.2} />
        </span>
      )}
    </>
  );
  const cls = 'flex w-full items-center gap-2.5 px-3 py-[11px]';
  return onPress ? (
    <button type="button" onClick={onPress} className={cls}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
};
