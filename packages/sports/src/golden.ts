/**
 * Golden logs and their runners, as a separate entry point so apps can run them against
 * their own build of the engines (plan D19) without bundling test data into the client.
 */
export * from './badminton/golden/logs.js';
export * from './badminton/golden/run.js';
export * from './cricket/golden/logs.js';
export * from './cricket/golden/run.js';
export * from './tennis/golden/logs.js';
export * from './tennis/golden/run.js';
export * from './volleyball/golden/logs.js';
export * from './volleyball/golden/run.js';
export * from './chess/golden/logs.js';
export * from './chess/golden/run.js';
export * from './football/golden/logs.js';
export * from './football/golden/run.js';
