import { UserError } from './state.mjs';

const later = () => { throw new UserError('release plan/run/verify are not available yet'); };
export const releasePlan = later;
export const releaseRun = later;
export const releaseVerify = later;
