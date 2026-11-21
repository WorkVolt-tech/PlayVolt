import React from 'react';
import {winRuleDisplay} from './winRule.js';
export function WinRuleBanner({mode='classic',winLength,playerCount=2,lobby=false,compact=false}){
 const r=winRuleDisplay({mode,winLength,playerCount,lobby});
 return <div className={'win-rule-banner'+(compact?' compact':'')} role="note"
   aria-label={'Match rule: '+r.headline+' '+r.outcome}>
    <span className="win-rule-icon" aria-hidden="true">◉</span>
    <div className="win-rule-copy">
      <small>OFFICIAL MATCH RULE {lobby?'· BEFORE START':''}</small>
      <strong>{r.headline}</strong>
      <span>{r.outcome}</span>
    </div>
    <span className="win-rule-side">{r.note}</span>
 </div>;
}
