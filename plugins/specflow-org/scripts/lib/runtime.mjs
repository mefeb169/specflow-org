export const MIN_NODE = 18;
// SDLC_FAKE_NODE_MAJOR lets tests simulate an old runtime.
export const nodeMajor = () => Number(process.env.SDLC_FAKE_NODE_MAJOR || process.versions.node.split('.')[0]);
export const nodeOk = () => nodeMajor() >= MIN_NODE;
