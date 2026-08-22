// Allow build scripts for native/compiled packages
function readPackage(pkg) {
  return pkg;
}

module.exports = { hooks: { readPackage } };
