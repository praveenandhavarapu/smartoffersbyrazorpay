import { loadModel } from '../state/model';
import { derive } from '../state/derived';
import { DEFAULT_USER_SETTINGS } from '../state/store';
import type { RayCtx } from '../ray/tools';

export async function testCtx(): Promise<RayCtx> {
  const model = await loadModel();
  const st = { settings: DEFAULT_USER_SETTINGS, approved: false, approvedSettings: null, overrides: {}, killed: false };
  return { model, derived: derive(model, st), settings: DEFAULT_USER_SETTINGS, approved: false, killed: false };
}
