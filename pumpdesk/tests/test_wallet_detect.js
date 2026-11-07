const assert = require("assert");
const { describePhantom } = require("../../desk/wallet.js");

assert.strictEqual(describePhantom({}).state, "unsupported");
assert.match(describePhantom({}).message, /Safari/);
assert.strictEqual(describePhantom({ phantom: { solana: { isPhantom: true } } }).state, "available");
assert.notStrictEqual(describePhantom({ phantom: { solana: { isPhantom: false } } }).state, "available");
console.log("PASS wallet detect");
