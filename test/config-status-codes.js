module.exports = {
  // rejects every status, so a passing run proves the CLI --status-codes won
  validateStatus: function () {
    return false;
  }
};
