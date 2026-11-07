/* Phantom browser provider detection. No embedded-wallet plugin. */
function describePhantom(scope) {
  var provider = scope && scope.phantom && scope.phantom.solana;
  if (provider && provider.isPhantom) {
    return {
      state: "available",
      message: "Phantom provider detected. Connect still needs your approval in the wallet.",
    };
  }
  return {
    state: "unsupported",
    message: "Phantom provider not found. Open this page in the Phantom in-app browser. Safari alone cannot sign.",
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { describePhantom: describePhantom };
}
