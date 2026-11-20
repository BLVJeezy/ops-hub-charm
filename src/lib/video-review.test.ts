import {describe,it,expect} from 'vitest';
import {decisionAllowed,nextSlot,momentLabel,revisionDue,portalMonths} from './video-review';
describe('video review rules',()=>{
 it('includes one revision on v1',()=>{expect(decisionAllowed('ter_review',1,0,'aanpassen')).toBe(true);expect(decisionAllowed('ter_review',1,1,'aanpassen')).toBe(false);});
 it('v2 only allows approval or billable feedback',()=>{expect(decisionAllowed('ter_review',2,1,'aanpassen')).toBe(false);expect(decisionAllowed('ter_review',2,1,'extra_betalend')).toBe(true);expect(decisionAllowed('ter_review',2,1,'goedgekeurd')).toBe(true);expect(decisionAllowed('ter_review',1,0,'extra_betalend')).toBe(false);});
 it('does not accept feedback outside review',()=>{expect(decisionAllowed('goedgekeurd',2,1,'goedgekeurd')).toBe(false);});
 it('assigns the next free monthly slot',()=>{expect(nextSlot([{slot:1},{slot:3}],11)).toBe(2);expect(nextSlot([{slot:1}],1)).toBeNull();});
 it('revision tasks are due today plus two days',()=>{expect(revisionDue('2026-11-30')).toBe('2026-12-02');});
 it('timestamps preserve playback seconds',()=>{expect(momentLabel(7)).toBe('0:07');expect(momentLabel(67.8)).toBe('1:07');});
 it('shows the current month first even with future videos',()=>{expect(portalMonths([{month:'2026-12-01'},{month:'2026-10-01'}],'2026-11-01')).toEqual(['2026-11-01','2026-12-01','2026-10-01']);});
});
