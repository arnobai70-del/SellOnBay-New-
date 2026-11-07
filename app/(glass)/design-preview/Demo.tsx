'use client';
import { useState } from 'react';
import { Seg } from '@/components/glass/Seg';
import { Switch } from '@/components/glass/Switch';

/* The two controls that need the browser, for /design-preview. Goes with the page when the redesign is finished. */
export function PreviewControls() {
  const [tab, setTab] = useState('all');
  const [on, setOn] = useState(true);
  return (
    <>
      <div className="g-li">
        <Seg
          label="Order filter"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'all', label: 'All' },
            { key: 'progress', label: 'In progress' },
            { key: 'done', label: 'Completed' },
            { key: 'refunded', label: 'Refunded' },
          ]}
        />
      </div>
      <div className="g-li">
        <div style={{ flex: 1, fontSize: 14 }}>Email me about orders ({on ? 'on' : 'off'})</div>
        <Switch label="Email me about orders" checked={on} onChange={setOn} />
      </div>
      <div className="g-li">
        <div style={{ flex: 1, fontSize: 14 }}>Keeps its own state</div>
        <Switch label="Keeps its own state" />
      </div>
      <div className="g-li">
        <div style={{ flex: 1, fontSize: 14 }}>Two-factor login, cannot be turned off here</div>
        <Switch label="Two-factor login" checked disabled />
      </div>
    </>
  );
}
