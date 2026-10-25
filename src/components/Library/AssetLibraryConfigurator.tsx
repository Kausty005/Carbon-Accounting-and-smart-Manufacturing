/**
 * WattWise AI — Configurable Asset & Sensor-Based Simulation Workspace
 * Exports the new AssetSimulationWorkspace component as default and primary export.
 */

import { AssetSimulationWorkspace } from './AssetSimulationWorkspace';
import { PlantWideFleetDashboard } from './PlantWideFleetDashboard';
import type { FleetAsset } from '../../services/fleetApi';

export type MachineAsset = FleetAsset;
export { AssetSimulationWorkspace, PlantWideFleetDashboard };
export const AssetLibraryConfigurator = AssetSimulationWorkspace;
export default AssetSimulationWorkspace;
