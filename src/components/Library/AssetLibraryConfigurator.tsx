/**
 * WattWise AI — 50-Asset Machine Library & Plant-Wide Scalability Dashboard
 * Re-exports the upgraded PlantWideFleetDashboard component.
 */

import { PlantWideFleetDashboard } from './PlantWideFleetDashboard';
import type { FleetAsset } from '../../services/fleetApi';

export type MachineAsset = FleetAsset;
export { PlantWideFleetDashboard };
export const AssetLibraryConfigurator = PlantWideFleetDashboard;
export default PlantWideFleetDashboard;
