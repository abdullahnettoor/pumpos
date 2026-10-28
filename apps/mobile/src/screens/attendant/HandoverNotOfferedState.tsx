import React from 'react';

/** The plan has no Attendant phone handover: the manager records it from the office. */
export const HandoverNotOfferedState: React.FC = () => (
  <div className="flex flex-col items-center px-8 pt-16 text-center">
    <h2 className="m-0 text-lg font-extrabold text-text-high">
      Your manager records your handover
    </h2>
    <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-text-muted">
      At the end of your shift, give your cash and readings to your manager. They enter your
      handover from the office.
    </p>
  </div>
);
