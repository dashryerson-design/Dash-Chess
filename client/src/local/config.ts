/** Browser configuration for the in-page server. */
export const ROOT = '';
export const config = {
  port: 0,
  host: 'local',
  dbPath: 'local',
  clientDist: '',
  dataDir: '/data',
  stockfishPath: '',
  stockfishWasm: '',
  botEngines: 1,
  analysisEngines: 1,
  analysisDepth: 10,
  shallowDepth: 5,
  analysisMultiPv: 3,
  cookieSecure: false,
  sessionDays: 3650,
  disconnectForfeitMs: 60_000,
  firstMoveAbortMs: 45_000,
  botDelay: true,
  isTest: false,
  isProd: true,
  blockSameIpRanked: false,
};
