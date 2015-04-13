(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/datatypes.js                                         //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
ConstraintSolver = {};                                                             // 1
                                                                                   // 2
var PV = PackageVersion;                                                           // 3
var CS = ConstraintSolver;                                                         // 4
                                                                                   // 5
////////// PackageAndVersion                                                       // 6
                                                                                   // 7
// An ordered pair of (package, version).                                          // 8
CS.PackageAndVersion = function (package, version) {                               // 9
  check(package, String);                                                          // 10
  check(version, String);                                                          // 11
                                                                                   // 12
  this.package = package;                                                          // 13
  this.version = version;                                                          // 14
};                                                                                 // 15
                                                                                   // 16
// The string form of a PackageAndVersion is "package version",                    // 17
// for example "foo 1.0.1".  The reason we don't use an "@" is                     // 18
// it would look too much like a PackageConstraint.                                // 19
CS.PackageAndVersion.prototype.toString = function () {                            // 20
  return this.package + " " + this.version;                                        // 21
};                                                                                 // 22
                                                                                   // 23
CS.PackageAndVersion.fromString = function (str) {                                 // 24
  var parts = str.split(' ');                                                      // 25
  if (parts.length === 2 && parts[0] && parts[1]) {                                // 26
    return new CS.PackageAndVersion(parts[0], parts[1]);                           // 27
  } else {                                                                         // 28
    throw new Error("Malformed PackageAndVersion: " + str);                        // 29
  }                                                                                // 30
};                                                                                 // 31
                                                                                   // 32
////////// Dependency                                                              // 33
                                                                                   // 34
// A Dependency consists of a PackageConstraint (like "foo@=1.2.3")                // 35
// and flags, like "isWeak".                                                       // 36
                                                                                   // 37
CS.Dependency = function (packageConstraint, flags) {                              // 38
  if (typeof packageConstraint !== 'string') {                                     // 39
    // this `if` is because Match.OneOf is really, really slow when it fails       // 40
    check(packageConstraint, Match.OneOf(PV.PackageConstraint, String));           // 41
  }                                                                                // 42
  if (typeof packageConstraint === 'string') {                                     // 43
    packageConstraint = PV.parsePackageConstraint(packageConstraint);              // 44
  }                                                                                // 45
  if (flags) {                                                                     // 46
    check(flags, Object);                                                          // 47
  }                                                                                // 48
                                                                                   // 49
  this.packageConstraint = packageConstraint;                                      // 50
  this.isWeak = false;                                                             // 51
                                                                                   // 52
  if (flags) {                                                                     // 53
    if (flags.isWeak) {                                                            // 54
      this.isWeak = true;                                                          // 55
    }                                                                              // 56
  }                                                                                // 57
};                                                                                 // 58
                                                                                   // 59
// The string form of a Dependency is `?foo@1.0.0` for a weak                      // 60
// reference to package "foo" with VersionConstraint "1.0.0".                      // 61
CS.Dependency.prototype.toString = function () {                                   // 62
  var ret = this.packageConstraint.toString();                                     // 63
  if (this.isWeak) {                                                               // 64
    ret = '?' + ret;                                                               // 65
  }                                                                                // 66
  return ret;                                                                      // 67
};                                                                                 // 68
                                                                                   // 69
CS.Dependency.fromString = function (str) {                                        // 70
  var isWeak = false;                                                              // 71
                                                                                   // 72
  if (str.charAt(0) === '?') {                                                     // 73
    isWeak = true;                                                                 // 74
    str = str.slice(1);                                                            // 75
  }                                                                                // 76
                                                                                   // 77
  var flags = isWeak ? { isWeak: true } : null;                                    // 78
                                                                                   // 79
  return new CS.Dependency(str, flags);                                            // 80
};                                                                                 // 81
                                                                                   // 82
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/catalog-cache.js                                     //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var CS = ConstraintSolver;                                                         // 1
var PV = PackageVersion;                                                           // 2
                                                                                   // 3
var pvkey = function (package, version) {                                          // 4
  return package + " " + version;                                                  // 5
};                                                                                 // 6
                                                                                   // 7
// Stores the Dependencies for each known PackageAndVersion.                       // 8
CS.CatalogCache = function () {                                                    // 9
  // String(PackageAndVersion) -> String -> Dependency.                            // 10
  // For example, "foo 1.0.0" -> "bar" -> Dependency.fromString("?bar@1.0.2").     // 11
  this._dependencies = {};                                                         // 12
  // A map derived from the keys of _dependencies, for ease of iteration.          // 13
  // "foo" -> ["1.0.0", ...]                                                       // 14
  // Versions in the array are unique but not sorted, unless the `.sorted`         // 15
  // property is set on the array.  The array is never empty.                      // 16
  this._versions = {};                                                             // 17
};                                                                                 // 18
                                                                                   // 19
CS.CatalogCache.prototype.hasPackageVersion = function (package, version) {        // 20
  return _.has(this._dependencies, pvkey(package, version));                       // 21
};                                                                                 // 22
                                                                                   // 23
CS.CatalogCache.prototype.addPackageVersion = function (p, v, deps) {              // 24
  check(p, String);                                                                // 25
  check(v, String);                                                                // 26
  // `deps` must not have any duplicate values of `.packageConstraint.package`     // 27
  check(deps, [CS.Dependency]);                                                    // 28
                                                                                   // 29
  var key = pvkey(p, v);                                                           // 30
  if (_.has(this._dependencies, key)) {                                            // 31
    throw new Error("Already have an entry for " + key);                           // 32
  }                                                                                // 33
                                                                                   // 34
  if (! _.has(this._versions, p)) {                                                // 35
    this._versions[p] = [];                                                        // 36
  }                                                                                // 37
  this._versions[p].push(v);                                                       // 38
  this._versions[p].sorted = false;                                                // 39
                                                                                   // 40
  var depsByPackage = {};                                                          // 41
  this._dependencies[key] = depsByPackage;                                         // 42
  _.each(deps, function (d) {                                                      // 43
    var p2 = d.packageConstraint.package;                                          // 44
    if (_.has(depsByPackage, p2)) {                                                // 45
      throw new Error("Can't have two dependencies on " + p2 +                     // 46
                      " in " + key);                                               // 47
    }                                                                              // 48
    depsByPackage[p2] = d;                                                         // 49
  });                                                                              // 50
};                                                                                 // 51
                                                                                   // 52
// Returns the dependencies of a (package, version), stored in a map.              // 53
// The values are Dependency objects; the key for `d` is                           // 54
// `d.packageConstraint.package`.  (Don't mutate the map.)                         // 55
CS.CatalogCache.prototype.getDependencyMap = function (p, v) {                     // 56
  var key = pvkey(p, v);                                                           // 57
  if (! _.has(this._dependencies, key)) {                                          // 58
    throw new Error("No entry for " + key);                                        // 59
  }                                                                                // 60
  return this._dependencies[key];                                                  // 61
};                                                                                 // 62
                                                                                   // 63
// Returns an array of version strings, sorted, possibly empty.                    // 64
// (Don't mutate the result.)                                                      // 65
CS.CatalogCache.prototype.getPackageVersions = function (package) {                // 66
  var result = (_.has(this._versions, package) ?                                   // 67
                this._versions[package] : []);                                     // 68
  if ((!result.length) || result.sorted) {                                         // 69
    return result;                                                                 // 70
  } else {                                                                         // 71
    // sort in place, and record so that we don't sort redundantly                 // 72
    // (we'll sort again if more versions are pushed onto the array)               // 73
    result.sort(PV.compare);                                                       // 74
    result.sorted = true;                                                          // 75
    return result;                                                                 // 76
  }                                                                                // 77
};                                                                                 // 78
                                                                                   // 79
CS.CatalogCache.prototype.hasPackage = function (package) {                        // 80
  return _.has(this._versions, package);                                           // 81
};                                                                                 // 82
                                                                                   // 83
CS.CatalogCache.prototype.toJSONable = function () {                               // 84
  var self = this;                                                                 // 85
  var data = {};                                                                   // 86
  _.each(self._dependencies, function (depsByPackage, key) {                       // 87
    // depsByPackage is a map of String -> Dependency.                             // 88
    // Map over the values to get an array of String.                              // 89
    data[key] = _.map(depsByPackage, function (dep) {                              // 90
      return dep.toString();                                                       // 91
    });                                                                            // 92
  });                                                                              // 93
  return { data: data };                                                           // 94
};                                                                                 // 95
                                                                                   // 96
CS.CatalogCache.fromJSONable = function (obj) {                                    // 97
  check(obj, { data: Object });                                                    // 98
                                                                                   // 99
  var cache = new CS.CatalogCache();                                               // 100
  _.each(obj.data, function (depsArray, pv) {                                      // 101
    check(depsArray, [String]);                                                    // 102
    pv = CS.PackageAndVersion.fromString(pv);                                      // 103
    cache.addPackageVersion(                                                       // 104
      pv.package, pv.version,                                                      // 105
      _.map(depsArray, function (str) {                                            // 106
        return CS.Dependency.fromString(str);                                      // 107
      }));                                                                         // 108
  });                                                                              // 109
  return cache;                                                                    // 110
};                                                                                 // 111
                                                                                   // 112
// Calls `iter` on each PackageAndVersion, with the second argument being          // 113
// a map from package name to Dependency.  If `iter` returns true,                 // 114
// iteration is stopped.  There's no particular order to the iteration.            // 115
CS.CatalogCache.prototype.eachPackageVersion = function (iter) {                   // 116
  var self = this;                                                                 // 117
  _.find(self._dependencies, function (value, key) {                               // 118
    var stop = iter(CS.PackageAndVersion.fromString(key), value);                  // 119
    return stop;                                                                   // 120
  });                                                                              // 121
};                                                                                 // 122
                                                                                   // 123
// Calls `iter` on each package name, with the second argument being               // 124
// a list of versions present for that package (unique and sorted).                // 125
// If `iter` returns true, iteration is stopped.                                   // 126
ConstraintSolver.CatalogCache.prototype.eachPackage = function (iter) {            // 127
  var self = this;                                                                 // 128
  _.find(_.keys(self._versions), function (key) {                                  // 129
    var stop = iter(key, self.getPackageVersions(key));                            // 130
    return stop;                                                                   // 131
  });                                                                              // 132
};                                                                                 // 133
                                                                                   // 134
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/catalog-loader.js                                    //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var PV = PackageVersion;                                                           // 1
var CS = ConstraintSolver;                                                         // 2
                                                                                   // 3
// A CatalogLoader populates the CatalogCache from the Catalog.  When              // 4
// running unit tests with no Catalog and canned data for the                      // 5
// CatalogCache, there will be no CatalogLoader.                                   // 6
//                                                                                 // 7
// Fine-grained Loading: While we don't currently support loading only             // 8
// some versions of a package, CatalogLoader is meant to be extended               // 9
// to support incrementally loading individual package versions.  It               // 10
// has no concept of a "loaded package," for example, just a loaded                // 11
// package version.  CatalogLoader's job, in principle, is to load                 // 12
// package versions efficiently, no matter the access pattern, by                  // 13
// making the right catalog calls and doing the right caching.                     // 14
// Calling a catalog method generally means running a SQLite query,                // 15
// which could be time-consuming.                                                  // 16
                                                                                   // 17
CS.CatalogLoader = function (fromCatalog, toCatalogCache) {                        // 18
  var self = this;                                                                 // 19
                                                                                   // 20
  self.catalog = fromCatalog;                                                      // 21
  self.catalogCache = toCatalogCache;                                              // 22
                                                                                   // 23
  self._sortedVersionRecordsCache = {};                                            // 24
};                                                                                 // 25
                                                                                   // 26
// We rely on the following `catalog` methods:                                     // 27
//                                                                                 // 28
// * getSortedVersionRecords(packageName) ->                                       // 29
//     [{packageName, version, dependencies}]                                      // 30
//                                                                                 // 31
//   Where `dependencies` is a map from packageName to                             // 32
//   an object of the form `{ constraint: String|null,                             // 33
//   references: [{arch: String, optional "weak": true}] }`.                       // 34
                                                                                   // 35
var convertDeps = function (catalogDeps) {                                         // 36
  return _.map(catalogDeps, function (dep, package) {                              // 37
    // The dependency is strong if any of its "references"                         // 38
    // (for different architectures) are strong.                                   // 39
    var isStrong = _.any(dep.references, function (ref) {                          // 40
      return !ref.weak;                                                            // 41
    });                                                                            // 42
                                                                                   // 43
    var constraint = (dep.constraint || null);                                     // 44
                                                                                   // 45
    return new CS.Dependency(new PV.PackageConstraint(package, constraint),        // 46
                             isStrong ? null : {isWeak: true});                    // 47
  });                                                                              // 48
};                                                                                 // 49
                                                                                   // 50
// Since we don't fetch different versions of a package independently              // 51
// at the moment, this helper is where we get our data.                            // 52
CS.CatalogLoader.prototype._getSortedVersionRecords = function (package) {         // 53
  if (! _.has(this._sortedVersionRecordsCache, package)) {                         // 54
    this._sortedVersionRecordsCache[package] =                                     // 55
      this.catalog.getSortedVersionRecords(package);                               // 56
  }                                                                                // 57
                                                                                   // 58
  return this._sortedVersionRecordsCache[package];                                 // 59
};                                                                                 // 60
                                                                                   // 61
CS.CatalogLoader.prototype.loadAllVersions = function (package) {                  // 62
  var self = this;                                                                 // 63
  var cache = self.catalogCache;                                                   // 64
  var versionRecs = self._getSortedVersionRecords(package);                        // 65
  _.each(versionRecs, function (rec) {                                             // 66
    var version = rec.version;                                                     // 67
    if (! cache.hasPackageVersion(package, version)) {                             // 68
      var deps = convertDeps(rec.dependencies);                                    // 69
      cache.addPackageVersion(package, version, deps);                             // 70
    }                                                                              // 71
  });                                                                              // 72
};                                                                                 // 73
                                                                                   // 74
// Takes an array of package names.  Loads all versions of them and their          // 75
// (strong) dependencies.                                                          // 76
CS.CatalogLoader.prototype.loadAllVersionsRecursive = function (packageList) {     // 77
  var self = this;                                                                 // 78
                                                                                   // 79
  // Within a call to loadAllVersionsRecursive, we only visit each package         // 80
  // at most once.  If we visit a package we've already loaded, it will            // 81
  // lead to a quick scan through the versions in our cache to make sure           // 82
  // they have been loaded into the CatalogCache.                                  // 83
  var loadQueue = [];                                                              // 84
  var packagesEverEnqueued = {};                                                   // 85
                                                                                   // 86
  var enqueue = function (package) {                                               // 87
    if (! _.has(packagesEverEnqueued, package)) {                                  // 88
      packagesEverEnqueued[package] = true;                                        // 89
      loadQueue.push(package);                                                     // 90
    }                                                                              // 91
  };                                                                               // 92
                                                                                   // 93
  _.each(packageList, enqueue);                                                    // 94
                                                                                   // 95
  while (loadQueue.length) {                                                       // 96
    var package = loadQueue.pop();                                                 // 97
    self.loadAllVersions(package);                                                 // 98
    _.each(self.catalogCache.getPackageVersions(package), function (v) {           // 99
      var depMap = self.catalogCache.getDependencyMap(package, v);                 // 100
      _.each(depMap, function (dep, package2) {                                    // 101
        enqueue(package2);                                                         // 102
      });                                                                          // 103
    });                                                                            // 104
  }                                                                                // 105
};                                                                                 // 106
                                                                                   // 107
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/constraint-solver-input.js                           //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var PV = PackageVersion;                                                           // 1
var CS = ConstraintSolver;                                                         // 2
                                                                                   // 3
// `check` can be really slow, so this line is a valve that makes it               // 4
// easy to turn off when debugging performance problems.                           // 5
var _check = check;                                                                // 6
                                                                                   // 7
// The "Input" object completely specifies the input to the resolver,              // 8
// and it holds the data loaded from the Catalog as well.  It can be               // 9
// serialized to JSON and read back in for testing purposes.                       // 10
CS.Input = function (dependencies, constraints, catalogCache, options) {           // 11
  var self = this;                                                                 // 12
  options = options || {};                                                         // 13
                                                                                   // 14
  // PackageConstraints passed in from the tool to us (where we are a              // 15
  // uniloaded package) will have constructors that we don't recognize             // 16
  // because they come from a different copy of package-version-parser!            // 17
  // Convert them to our PackageConstraint class if necessary.  (This is           // 18
  // just top-level constraints from .meteor/packages or running from              // 19
  // checkout, so it's not a lot of data.)                                         // 20
  constraints = _.map(constraints, function (c) {                                  // 21
    if (c instanceof PV.PackageConstraint) {                                       // 22
      return c;                                                                    // 23
    } else {                                                                       // 24
      return PV.parsePackageConstraint(c.package, c.constraintString);             // 25
    }                                                                              // 26
  });                                                                              // 27
                                                                                   // 28
  // Note that `dependencies` and `constraints` are required (you can't            // 29
  // omit them or pass null), while the other properties have defaults.            // 30
  self.dependencies = dependencies;                                                // 31
  self.constraints = constraints;                                                  // 32
  // If you add a property, make sure you add it to:                               // 33
  // - The `check` statements below                                                // 34
  // - toJSONable (this file)                                                      // 35
  // - fromJSONable (this file)                                                    // 36
  // - the "input serialization" test in constraint-solver-tests.js                // 37
  // If it's an option passed in from the tool, you'll also have to                // 38
  // add it to CS.PackagesResolver#resolve.                                        // 39
  self.upgrade = options.upgrade || [];                                            // 40
  self.anticipatedPrereleases = options.anticipatedPrereleases || {};              // 41
  self.previousSolution = options.previousSolution || null;                        // 42
  self.allowIncompatibleUpdate = options.allowIncompatibleUpdate || false;         // 43
  self.upgradeIndirectDepPatchVersions =                                           // 44
    options.upgradeIndirectDepPatchVersions || false;                              // 45
                                                                                   // 46
  _check(self.dependencies, [String]);                                             // 47
  _check(self.constraints, [PV.PackageConstraint]);                                // 48
  _check(self.upgrade, [String]);                                                  // 49
  _check(self.anticipatedPrereleases,                                              // 50
        Match.ObjectWithValues(Match.ObjectWithValues(Boolean)));                  // 51
  _check(self.previousSolution, Match.OneOf(Object, null));                        // 52
  _check(self.allowIncompatibleUpdate, Boolean);                                   // 53
  _check(self.upgradeIndirectDepPatchVersions, Boolean);                           // 54
                                                                                   // 55
  self.catalogCache = catalogCache;                                                // 56
  _check(self.catalogCache, CS.CatalogCache);                                      // 57
  // The catalog presumably has valid package names in it, but make sure           // 58
  // there aren't any characters in there somehow that will trip us up             // 59
  // with creating valid variable strings.                                         // 60
  self.catalogCache.eachPackage(function (packageName) {                           // 61
    validatePackageName(packageName);                                              // 62
  });                                                                              // 63
  self.catalogCache.eachPackageVersion(function (packageName, depsMap) {           // 64
    _.each(depsMap, function (deps, depPackageName) {                              // 65
      validatePackageName(depPackageName);                                         // 66
    });                                                                            // 67
  });                                                                              // 68
                                                                                   // 69
  _.each(self.dependencies, validatePackageName);                                  // 70
  _.each(self.upgrade, validatePackageName);                                       // 71
  _.each(self.constraints, function (c) {                                          // 72
    validatePackageName(c.package);                                                // 73
  });                                                                              // 74
  if (self.previousSolution) {                                                     // 75
    _.each(_.keys(self.previousSolution),                                          // 76
           validatePackageName);                                                   // 77
  }                                                                                // 78
                                                                                   // 79
  self._dependencySet = {}; // package name -> true                                // 80
  _.each(self.dependencies, function (d) {                                         // 81
    self._dependencySet[d] = true;                                                 // 82
  });                                                                              // 83
  self._upgradeSet = {};                                                           // 84
  _.each(self.upgrade, function (u) {                                              // 85
    self._upgradeSet[u] = true;                                                    // 86
  });                                                                              // 87
};                                                                                 // 88
                                                                                   // 89
validatePackageName = function (name) {                                            // 90
  PV.validatePackageName(name);                                                    // 91
  // We have some hard requirements of our own so that packages can be             // 92
  // used as solver variables.  PV.validatePackageName should already              // 93
  // enforce these requirements and more, so these checks are just a               // 94
  // backstop in case it changes under us somehow.                                 // 95
  if ((name.charAt(0) === '$') || (name.charAt(0) === '-')) {                      // 96
    throw new Error("First character of package name cannot be: " +                // 97
                    name.charAt(0));                                               // 98
  }                                                                                // 99
  if (/ /.test(name)) {                                                            // 100
    throw new Error("No space allowed in package name");                           // 101
  }                                                                                // 102
};                                                                                 // 103
                                                                                   // 104
CS.Input.prototype.isKnownPackage = function (p) {                                 // 105
  return this.catalogCache.hasPackage(p);                                          // 106
};                                                                                 // 107
                                                                                   // 108
CS.Input.prototype.isRootDependency = function (p) {                               // 109
  return _.has(this._dependencySet, p);                                            // 110
};                                                                                 // 111
                                                                                   // 112
CS.Input.prototype.isUpgrading = function (p) {                                    // 113
  return _.has(this._upgradeSet, p);                                               // 114
};                                                                                 // 115
                                                                                   // 116
CS.Input.prototype.isInPreviousSolution = function (p) {                           // 117
  return !! (this.previousSolution && _.has(this.previousSolution, p));            // 118
};                                                                                 // 119
                                                                                   // 120
CS.Input.prototype.loadFromCatalog = function (catalogLoader) {                    // 121
  var self = this;                                                                 // 122
                                                                                   // 123
  var packagesToLoad = {}; // package -> true                                      // 124
                                                                                   // 125
  _.each(self.dependencies, function (package) {                                   // 126
    packagesToLoad[package] = true;                                                // 127
  });                                                                              // 128
  _.each(self.constraints, function (constraint) {                                 // 129
    packagesToLoad[constraint.package] = true;                                     // 130
  });                                                                              // 131
  if (self.previousSolution) {                                                     // 132
    _.each(self.previousSolution, function (version, package) {                    // 133
      packagesToLoad[package] = true;                                              // 134
    });                                                                            // 135
  }                                                                                // 136
                                                                                   // 137
  // Load packages into the cache (if they aren't loaded already).                 // 138
  catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));                  // 139
};                                                                                 // 140
                                                                                   // 141
CS.Input.prototype.toJSONable = function () {                                      // 142
  var self = this;                                                                 // 143
  var obj = {                                                                      // 144
    dependencies: self.dependencies,                                               // 145
    constraints: _.map(self.constraints, function (c) {                            // 146
      return c.toString();                                                         // 147
    }),                                                                            // 148
    catalogCache: self.catalogCache.toJSONable()                                   // 149
  };                                                                               // 150
                                                                                   // 151
  // For readability of the resulting JSON, only include optional                  // 152
  // properties that aren't the default.                                           // 153
  if (self.upgrade.length) {                                                       // 154
    obj.upgrade = self.upgrade;                                                    // 155
  }                                                                                // 156
  if (! _.isEmpty(self.anticipatedPrereleases)) {                                  // 157
    obj.anticipatedPrereleases = self.anticipatedPrereleases;                      // 158
  }                                                                                // 159
  if (self.previousSolution !== null) {                                            // 160
    obj.previousSolution = self.previousSolution;                                  // 161
  }                                                                                // 162
  if (self.allowIncompatibleUpdate) {                                              // 163
    obj.allowIncompatibleUpdate = true;                                            // 164
  }                                                                                // 165
  if (self.upgradeIndirectDepPatchVersions) {                                      // 166
    obj.upgradeIndirectDepPatchVersions = true;                                    // 167
  }                                                                                // 168
                                                                                   // 169
  return obj;                                                                      // 170
};                                                                                 // 171
                                                                                   // 172
CS.Input.fromJSONable = function (obj) {                                           // 173
  _check(obj, {                                                                    // 174
    dependencies: [String],                                                        // 175
    constraints: [String],                                                         // 176
    catalogCache: Object,                                                          // 177
    anticipatedPrereleases: Match.Optional(                                        // 178
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean))),                    // 179
    previousSolution: Match.Optional(Match.OneOf(Object, null)),                   // 180
    upgrade: Match.Optional([String]),                                             // 181
    allowIncompatibleUpdate: Match.Optional(Boolean),                              // 182
    upgradeIndirectDepPatchVersions: Match.Optional(Boolean)                       // 183
  });                                                                              // 184
                                                                                   // 185
  return new CS.Input(                                                             // 186
    obj.dependencies,                                                              // 187
    _.map(obj.constraints, function (cstr) {                                       // 188
      return PV.parsePackageConstraint(cstr);                                      // 189
    }),                                                                            // 190
    CS.CatalogCache.fromJSONable(obj.catalogCache),                                // 191
    {                                                                              // 192
      upgrade: obj.upgrade,                                                        // 193
      anticipatedPrereleases: obj.anticipatedPrereleases,                          // 194
      previousSolution: obj.previousSolution,                                      // 195
      allowIncompatibleUpdate: obj.allowIncompatibleUpdate,                        // 196
      upgradeIndirectDepPatchVersions: obj.upgradeIndirectDepPatchVersions         // 197
    });                                                                            // 198
};                                                                                 // 199
                                                                                   // 200
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/version-pricer.js                                    //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var CS = ConstraintSolver;                                                         // 1
var PV = PackageVersion;                                                           // 2
                                                                                   // 3
CS.VersionPricer = function () {                                                   // 4
  var self = this;                                                                 // 5
                                                                                   // 6
  // self.getVersionInfo(versionString) returns an object                          // 7
  // that contains at least { major, minor, patch }.                               // 8
  //                                                                               // 9
  // The VersionPricer instance stores a memoization table for                     // 10
  // efficiency.                                                                   // 11
  self.getVersionInfo = _.memoize(PV.parse);                                       // 12
};                                                                                 // 13
                                                                                   // 14
CS.VersionPricer.MODE_UPDATE = 1;                                                  // 15
CS.VersionPricer.MODE_GRAVITY = 2;                                                 // 16
CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES = 3;                                    // 17
                                                                                   // 18
// priceVersions(versions, mode, options) calculates small integer                 // 19
// costs for each version, based on whether each part of the version               // 20
// is low or high relative to the other versions with the same higher              // 21
// parts.                                                                          // 22
//                                                                                 // 23
// For example, if "1.2.0" and "1.2.1" are the only 1.2.x versions                 // 24
// in the versions array, they will be assigned PATCH costs of                     // 25
// 1 and 0 in UPDATE mode (penalizing the older version), or 0 and 1               // 26
// in GRAVITY mode (penalizing the newer version).  When optimizing,               // 27
// the solver will prioritizing minimizing MAJOR costs, then MINOR                 // 28
// costs, then PATCH costs, and then "REST" costs (which penalizing                // 29
// being old or new within versions that have the same major, minor,               // 30
// AND patch).                                                                     // 31
//                                                                                 // 32
// - `versions` - Array of version strings in sorted order                         // 33
// - `mode` - A MODE constant                                                      // 34
// - `options`:                                                                    // 35
//   - `versionAfter` - if provided, the next newer version not in the             // 36
//     array but that would come next.                                             // 37
//   - `versionBefore` - if provided, the next older version not in the            // 38
//     the array but that would come before it.                                    // 39
//                                                                                 // 40
// Returns: an array of 4 arrays, each of length versions.length,                  // 41
// containing the MAJOR, MINOR, PATCH, and REST costs corresponding                // 42
// to the versions.                                                                // 43
//                                                                                 // 44
// MODE_UPDATE penalizes versions for being old (because we want                   // 45
// them to be new), while the MODE_GRAVITY penalizes versions for                  // 46
// being new (because we are trying to apply "version gravity" and                 // 47
// prefer older versions).  MODE_GRAVITY_WITH_PATCHES applies gravity              // 48
// to the major and minor parts of the version, but prefers updates                // 49
// to the patch and rest of the version.                                           // 50
//                                                                                 // 51
// Use `versionAfter` when scanning a partial array of versions                    // 52
// if you want the newest version in the array to have a non-zero                  // 53
// weight in MODE_UPDATE.  For example, the versions                               // 54
// `["1.0.0", "1.0.1"]` will be considered to have an out-of-date                  // 55
// version if versionAfter is `"2.0.0"`.  The costs returned                       // 56
// won't be the same as if the whole array was scanned at once,                    // 57
// but this option is useful in order to apply MODE_UPDATE to some                 // 58
// versions and MODE_GRAVITY to others, for example.                               // 59
//                                                                                 // 60
// `versionBefore` is used in an analogous way with the GRAVITY modes.             // 61
//                                                                                 // 62
// The easiest way to implement this function would be to partition                // 63
// `versions` into subarrays of versions with the same major part,                 // 64
// and then partition those arrays based on the minor parts, and                   // 65
// so on.  However, that's a lot of array allocations -- O(N) or                   // 66
// thereabouts.  So instead we use a linear scan backwards through                 // 67
// the versions array.                                                             // 68
CS.VersionPricer.prototype.priceVersions = function (versions, mode, options) {    // 69
  var self = this;                                                                 // 70
                                                                                   // 71
  var getMajorMinorPatch = function (v) {                                          // 72
    var vInfo = self.getVersionInfo(v);                                            // 73
    return [vInfo.major, vInfo.minor, vInfo.patch];                                // 74
  };                                                                               // 75
                                                                                   // 76
  var MAJOR = 0, MINOR = 1, PATCH = 2, REST = 3;                                   // 77
  var gravity; // array of MAJOR, MINOR, PATCH, REST                               // 78
                                                                                   // 79
  switch (mode) {                                                                  // 80
  case CS.VersionPricer.MODE_UPDATE:                                               // 81
    gravity = [false, false, false, false];                                        // 82
    break;                                                                         // 83
  case CS.VersionPricer.MODE_GRAVITY:                                              // 84
    gravity = [true, true, true, true];                                            // 85
    break;                                                                         // 86
  case CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES:                                 // 87
    gravity = [true, true, false, false];                                          // 88
    break;                                                                         // 89
  default:                                                                         // 90
    throw new Error("Bad mode: " + mode);                                          // 91
  }                                                                                // 92
                                                                                   // 93
  var lastMajorMinorPatch = null;                                                  // 94
  if (options && options.versionAfter) {                                           // 95
    lastMajorMinorPatch = getMajorMinorPatch(options.versionAfter);                // 96
  }                                                                                // 97
  // `costs` contains arrays of whole numbers, each of which will                  // 98
  // have a length of versions.length.  This is what we will return.               // 99
  var costs = [[], [], [], []]; // MAJOR, MINOR, PATCH, REST                       // 100
  // How many in a row of the same MAJOR, MINOR, or PATCH have we seen?            // 101
  var countOfSame = [0, 0, 0];                                                     // 102
                                                                                   // 103
  // Track how old each part of versions[i] is, in terms of how many               // 104
  // greater values there are for that part among versions with the                // 105
  // same higher parts.  For example, oldness[REST] counts the number              // 106
  // of versions after versions[i] with the same MAJOR, MINOR, and REST.           // 107
  // oldness[PATCH] counts the number of *different* higher values for             // 108
  // for PATCH among later versions with the same MAJOR and MINOR parts.           // 109
  var oldness = [0, 0, 0, 0];                                                      // 110
                                                                                   // 111
  // Walk the array backwards                                                      // 112
  for (var i = versions.length - 1; i >= 0; i--) {                                 // 113
    var v = versions[i];                                                           // 114
    var majorMinorPatch = getMajorMinorPatch(v);                                   // 115
    if (lastMajorMinorPatch) {                                                     // 116
      for (var k = MAJOR; k <= REST; k++) {                                        // 117
        if (k === REST || majorMinorPatch[k] !== lastMajorMinorPatch[k]) {         // 118
          // For the highest part that changed, bumped the oldness                 // 119
          // and clear the lower oldnesses.                                        // 120
          oldness[k]++;                                                            // 121
          for (var m = k+1; m <= REST; m++) {                                      // 122
            if (gravity[m]) {                                                      // 123
              // if we should actually be counting "newness" instead of            // 124
              // oldness, flip the count.  Instead of [0, 1, 1, 2, 3],             // 125
              // for example, make it [3, 2, 2, 1, 0].  This is the place          // 126
              // to do it, because we have just "closed out" a run.                // 127
              flipLastN(costs[m], countOfSame[m-1], oldness[m]);                   // 128
            }                                                                      // 129
            countOfSame[m-1] = 0;                                                  // 130
            oldness[m] = 0;                                                        // 131
          }                                                                        // 132
          break;                                                                   // 133
        }                                                                          // 134
      }                                                                            // 135
    }                                                                              // 136
    for (var k = MAJOR; k <= REST; k++) {                                          // 137
      costs[k].push(oldness[k]);                                                   // 138
      if (k !== REST) {                                                            // 139
        countOfSame[k]++;                                                          // 140
      }                                                                            // 141
    }                                                                              // 142
    lastMajorMinorPatch = majorMinorPatch;                                         // 143
  }                                                                                // 144
  if (options && options.versionBefore && versions.length) {                       // 145
    // bump the appropriate value of oldness, as if we ran the loop                // 146
    // one more time                                                               // 147
    majorMinorPatch = getMajorMinorPatch(options.versionBefore);                   // 148
    for (var k = MAJOR; k <= REST; k++) {                                          // 149
      if (k === REST || majorMinorPatch[k] !== lastMajorMinorPatch[k]) {           // 150
        oldness[k]++;                                                              // 151
        break;                                                                     // 152
      }                                                                            // 153
    }                                                                              // 154
  }                                                                                // 155
                                                                                   // 156
  // Flip the MAJOR costs if we have MAJOR gravity -- subtracting them             // 157
  // all from oldness[MAJOR] -- and likewise for other parts if countOfSame        // 158
  // is > 0 for the next highest part (meaning we didn't get a chance to           // 159
  // flip some of the costs because the loop ended).                               // 160
  for (var k = MAJOR; k <= REST; k++) {                                            // 161
    if (gravity[k]) {                                                              // 162
      flipLastN(costs[k], k === MAJOR ? costs[k].length : countOfSame[k-1],        // 163
                oldness[k]);                                                       // 164
    }                                                                              // 165
  }                                                                                // 166
                                                                                   // 167
  // We pushed costs onto the arrays in reverse order.  Reverse the cost           // 168
  // arrays in place before returning them.                                        // 169
  return [costs[MAJOR].reverse(),                                                  // 170
          costs[MINOR].reverse(),                                                  // 171
          costs[PATCH].reverse(),                                                  // 172
          costs[REST].reverse()];                                                  // 173
};                                                                                 // 174
                                                                                   // 175
// "Flip" the last N elements of array in place by subtracting each                // 176
// one from `max`.  For example, if `a` is `[3,0,1,1,2]`, then calling             // 177
// `flipLastN(a, 4, 2)` mutates `a` into `[3,2,1,1,0]`.                            // 178
var flipLastN = function (array, N, max) {                                         // 179
  var len = array.length;                                                          // 180
  for (var i = 0; i < N; i++) {                                                    // 181
    var j = len - 1 - i;                                                           // 182
    array[j] = max - array[j];                                                     // 183
  }                                                                                // 184
};                                                                                 // 185
                                                                                   // 186
// Partition a sorted array of versions into three arrays, containing              // 187
// the versions that are `older` than the `target` version,                        // 188
// `compatible` with it, or have a `higherMajor` version.                          // 189
//                                                                                 // 190
// For example, `["1.0.0", "2.5.0", "2.6.1", "3.0.0"]` with a target of            // 191
// `"2.5.0"` returns `{ older: ["1.0.0"], compatible: ["2.5.0", "2.6.1"],          // 192
// higherMajor: ["3.0.0"] }`.                                                      // 193
CS.VersionPricer.prototype.partitionVersions = function (versions, target) {       // 194
  var self = this;                                                                 // 195
  var firstGteIndex = versions.length;                                             // 196
  var higherMajorIndex = versions.length;                                          // 197
  var targetVInfo = self.getVersionInfo(target);                                   // 198
  for (var i = 0; i < versions.length; i++) {                                      // 199
    var v = versions[i];                                                           // 200
    var vInfo = self.getVersionInfo(v);                                            // 201
    if (firstGteIndex === versions.length &&                                       // 202
        ! PV.lessThan(vInfo, targetVInfo)) {                                       // 203
      firstGteIndex = i;                                                           // 204
    }                                                                              // 205
    if (vInfo.major > targetVInfo.major) {                                         // 206
      higherMajorIndex = i;                                                        // 207
      break;                                                                       // 208
    }                                                                              // 209
  }                                                                                // 210
  return { older: versions.slice(0, firstGteIndex),                                // 211
           compatible: versions.slice(firstGteIndex, higherMajorIndex),            // 212
           higherMajor: versions.slice(higherMajorIndex) };                        // 213
};                                                                                 // 214
                                                                                   // 215
// Use a combination of calls to priceVersions with different modes in order       // 216
// to generate costs for versions relative to a "previous solution" version        // 217
// (called the "target" here).                                                     // 218
CS.VersionPricer.prototype.priceVersionsWithPrevious = function (                  // 219
  versions, target, takePatches) {                                                 // 220
                                                                                   // 221
  var self = this;                                                                 // 222
  var parts = self.partitionVersions(versions, target);                            // 223
                                                                                   // 224
  var result1 = self.priceVersions(parts.older, CS.VersionPricer.MODE_UPDATE,      // 225
                                   { versionAfter: target });                      // 226
  // Usually, it's better to remain as close as possible to the target             // 227
  // version, but prefer higher patch versions (and wrapNums, etc.) if             // 228
  // we were passed `takePatches`.                                                 // 229
  var result2 = self.priceVersions(parts.compatible,                               // 230
                                   (takePatches ?                                  // 231
                                    CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES :   // 232
                                    CS.VersionPricer.MODE_GRAVITY));               // 233
  // If we're already bumping the major version, might as well take patches.       // 234
  var result3 = self.priceVersions(parts.higherMajor,                              // 235
                                   CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES,     // 236
                                   // not actually the version right before, but   // 237
                                   // gives the `major` cost the bump it needs     // 238
                                   { versionBefore: target });                     // 239
                                                                                   // 240
  // Generate a fifth array, incompat, which has a 1 for each incompatible         // 241
  // version and a 0 for each compatible version.                                  // 242
  var incompat = [];                                                               // 243
  var i;                                                                           // 244
  for (i = 0; i < parts.older.length; i++) {                                       // 245
    incompat.push(1);                                                              // 246
  }                                                                                // 247
  for (i = 0; i < parts.compatible.length; i++) {                                  // 248
    incompat.push(0);                                                              // 249
  }                                                                                // 250
  for (i = 0; i < parts.higherMajor.length; i++) {                                 // 251
    incompat.push(1);                                                              // 252
  }                                                                                // 253
                                                                                   // 254
  return [                                                                         // 255
    incompat,                                                                      // 256
    result1[0].concat(result2[0], result3[0]),                                     // 257
    result1[1].concat(result2[1], result3[1]),                                     // 258
    result1[2].concat(result2[2], result3[2]),                                     // 259
    result1[3].concat(result2[3], result3[3])                                      // 260
  ];                                                                               // 261
};                                                                                 // 262
                                                                                   // 263
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/solver.js                                            //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var CS = ConstraintSolver;                                                         // 1
var PV = PackageVersion;                                                           // 2
                                                                                   // 3
var pvVar = function (p, v) {                                                      // 4
  return p + ' ' + v;                                                              // 5
};                                                                                 // 6
                                                                                   // 7
// The "inner solver".  You construct it with a ConstraintSolver.Input object      // 8
// (which specifies the problem) and then call .getAnswer() on it.                 // 9
                                                                                   // 10
CS.Solver = function (input, options) {                                            // 11
  var self = this;                                                                 // 12
  check(input, CS.Input);                                                          // 13
                                                                                   // 14
  self.input = input;                                                              // 15
  self.errors = []; // [String]                                                    // 16
                                                                                   // 17
  self.pricer = new CS.VersionPricer();                                            // 18
  self.getConstraintFormula = _.memoize(_getConstraintFormula,                     // 19
                                         function (p, vConstraint) {               // 20
                                           return p + "@" + vConstraint.raw;       // 21
                                         });                                       // 22
                                                                                   // 23
  self.options = options || {};                                                    // 24
  self.Profile = (self.options.Profile || CS.DummyProfile);                        // 25
                                                                                   // 26
  self.steps = [];                                                                 // 27
  self.stepsByName = {};                                                           // 28
                                                                                   // 29
  self.analysis = {};                                                              // 30
                                                                                   // 31
  self.Profile.time("Solver#analyze", function () {                                // 32
    self.analyze();                                                                // 33
  });                                                                              // 34
                                                                                   // 35
  self.logic = null; // Logic.Solver, initialized later                            // 36
};                                                                                 // 37
                                                                                   // 38
CS.Solver.prototype.throwAnyErrors = function () {                                 // 39
  if (this.errors.length) {                                                        // 40
    var multiline = _.any(this.errors, function (e) {                              // 41
      return /\n/.test(e);                                                         // 42
    });                                                                            // 43
    CS.throwConstraintSolverError(this.errors.join(                                // 44
      multiline ? '\n\n' : '\n'));                                                 // 45
  }                                                                                // 46
};                                                                                 // 47
                                                                                   // 48
CS.Solver.prototype.getVersions = function (package) {                             // 49
  var self = this;                                                                 // 50
  if (_.has(self.analysis.allowedVersions, package)) {                             // 51
    return self.analysis.allowedVersions[package];                                 // 52
  } else {                                                                         // 53
    return self.input.catalogCache.getPackageVersions(package);                    // 54
  }                                                                                // 55
};                                                                                 // 56
                                                                                   // 57
// Populates `self.analysis` with various data structures derived from the         // 58
// input.  May also throw errors, and may call methods that rely on                // 59
// analysis once that particular analysis is done (e.g. `self.getVersions`         // 60
// which relies on `self.analysis.allowedVersions`.                                // 61
CS.Solver.prototype.analyze = function () {                                        // 62
  var self = this;                                                                 // 63
  var analysis = self.analysis;                                                    // 64
  var input = self.input;                                                          // 65
  var cache = input.catalogCache;                                                  // 66
  var Profile = self.Profile;                                                      // 67
                                                                                   // 68
  ////////// ANALYZE ALLOWED VERSIONS                                              // 69
  // (An "allowed version" is one that isn't ruled out by a top-level              // 70
  // constraint.)                                                                  // 71
                                                                                   // 72
  // package -> array of version strings.  If a package has an entry in            // 73
  // this map, then only the versions in the array are allowed for                 // 74
  // consideration.                                                                // 75
  analysis.allowedVersions = {};                                                   // 76
  analysis.packagesWithNoAllowedVersions = {}; // package -> [constraints]         // 77
                                                                                   // 78
  // Process top-level constraints, applying them right now by                     // 79
  // limiting what package versions we even consider.  This speeds up              // 80
  // solving, especially given the equality constraints on core                    // 81
  // packages.  For versions we don't allow, we get to avoid generating            // 82
  // Constraint objects for their constraints, which saves us both                 // 83
  // clause generation time and solver work up through the point where we          // 84
  // determine there are no conflicts between constraints.                         // 85
  //                                                                               // 86
  // we can't throw any errors yet, because `input.constraints`                    // 87
  // doesn't establish any dependencies (so we don't know if it's a                // 88
  // problem that some package has no legal versions), but we can                  // 89
  // track such packages in packagesWithNoAllowedVersions so that we               // 90
  // throw a good error later.                                                     // 91
  Profile.time("analyze allowed versions", function () {                           // 92
    _.each(_.groupBy(input.constraints, 'package'), function (cs, p) {             // 93
      var versions = cache.getPackageVersions(p);                                  // 94
      if (! versions.length) {                                                     // 95
        // deal with wholly unknown packages later                                 // 96
        return;                                                                    // 97
      }                                                                            // 98
      _.each(cs, function (constr) {                                               // 99
        versions = _.filter(versions, function (v) {                               // 100
          return CS.isConstraintSatisfied(p, constr.versionConstraint, v);         // 101
        });                                                                        // 102
      });                                                                          // 103
      if (! versions.length) {                                                     // 104
        analysis.packagesWithNoAllowedVersions[p] = _.filter(cs, function (c) {    // 105
          return !! c.constraintString;                                            // 106
        });                                                                        // 107
      }                                                                            // 108
      analysis.allowedVersions[p] = versions;                                      // 109
    });                                                                            // 110
  });                                                                              // 111
                                                                                   // 112
  ////////// ANALYZE ROOT DEPENDENCIES                                             // 113
                                                                                   // 114
  // Collect root dependencies that we've never heard of.                          // 115
  analysis.unknownRootDeps = [];                                                   // 116
  // Collect "previous solution" versions of root dependencies.                    // 117
  analysis.previousRootDepVersions = [];                                           // 118
                                                                                   // 119
  Profile.time("analyze root dependencies", function () {                          // 120
    _.each(input.dependencies, function (p) {                                      // 121
      if (! input.isKnownPackage(p)) {                                             // 122
        analysis.unknownRootDeps.push(p);                                          // 123
      } else if (input.isInPreviousSolution(p) &&                                  // 124
                 ! input.isUpgrading(p)) {                                         // 125
        analysis.previousRootDepVersions.push(new CS.PackageAndVersion(            // 126
          p, input.previousSolution[p]));                                          // 127
      }                                                                            // 128
    });                                                                            // 129
                                                                                   // 130
    // throw if there are unknown packages in root deps                            // 131
    if (analysis.unknownRootDeps.length) {                                         // 132
      _.each(analysis.unknownRootDeps, function (p) {                              // 133
        self.errors.push('unknown package in top-level dependencies: ' + p);       // 134
      });                                                                          // 135
      self.throwAnyErrors();                                                       // 136
    }                                                                              // 137
  });                                                                              // 138
                                                                                   // 139
  ////////// ANALYZE REACHABILITY                                                  // 140
                                                                                   // 141
  // A "reachable" package is one that is either a root dependency or              // 142
  // a strong dependency of any "allowed" version of a reachable package.          // 143
  // In other words, we walk all strong dependencies starting                      // 144
  // with the root dependencies, and visiting all allowed versions of each         // 145
  // package.                                                                      // 146
  //                                                                               // 147
  // This analysis is mainly done for performance, because if there are            // 148
  // extraneous packages in the CatalogCache (for whatever reason) we              // 149
  // want to spend as little time on them as possible.  It also establishes        // 150
  // the universe of possible "known" and "unknown" packages we might              // 151
  // come across.                                                                  // 152
  //                                                                               // 153
  // A more nuanced reachability analysis that takes versions into account         // 154
  // is probably possible.                                                         // 155
                                                                                   // 156
  // package name -> true                                                          // 157
  analysis.reachablePackages = {};                                                 // 158
  // package name -> package versions asking for it (in pvVar form)                // 159
  analysis.unknownPackages = {};                                                   // 160
                                                                                   // 161
  var markReachable = function (p) {                                               // 162
    analysis.reachablePackages[p] = true;                                          // 163
                                                                                   // 164
    _.each(self.getVersions(p), function (v) {                                     // 165
      _.each(cache.getDependencyMap(p, v), function (dep) {                        // 166
        // `dep` is a CS.Dependency                                                // 167
        var p2 = dep.packageConstraint.package;                                    // 168
        if (! input.isKnownPackage(p2)) {                                          // 169
          // record this package so we will generate a variable                    // 170
          // for it.  we'll try not to select it, and ultimately                   // 171
          // throw an error if we are forced to.                                   // 172
          if (! _.has(analysis.unknownPackages, p2)) {                             // 173
            analysis.unknownPackages[p2] = [];                                     // 174
          }                                                                        // 175
          analysis.unknownPackages[p2].push(pvVar(p, v));                          // 176
        } else {                                                                   // 177
          if (! dep.isWeak) {                                                      // 178
            if (! _.has(analysis.reachablePackages, p2)) {                         // 179
              markReachable(p2);                                                   // 180
            }                                                                      // 181
          }                                                                        // 182
        }                                                                          // 183
      });                                                                          // 184
    });                                                                            // 185
  };                                                                               // 186
                                                                                   // 187
  Profile.time("analyze reachability", function () {                               // 188
    _.each(input.dependencies, markReachable);                                     // 189
  });                                                                              // 190
                                                                                   // 191
  ////////// ANALYZE CONSTRAINTS                                                   // 192
                                                                                   // 193
  // Array of CS.Solver.Constraint                                                 // 194
  analysis.constraints = [];                                                       // 195
  // packages `foo` such that there's a simple top-level equality                  // 196
  // constraint about `foo`.  package name -> true.                                // 197
  analysis.topLevelEqualityConstrainedPackages = {};                               // 198
                                                                                   // 199
  Profile.time("analyze constraints", function () {                                // 200
    // top-level constraints                                                       // 201
    _.each(input.constraints, function (c) {                                       // 202
      if (c.constraintString) {                                                    // 203
        analysis.constraints.push(new CS.Solver.Constraint(                        // 204
          null, c.package, c.versionConstraint,                                    // 205
          "constraint#" + analysis.constraints.length));                           // 206
                                                                                   // 207
        if (c.versionConstraint.alternatives.length === 1 &&                       // 208
            c.versionConstraint.alternatives[0].type === 'exactly') {              // 209
          analysis.topLevelEqualityConstrainedPackages[c.package] = true;          // 210
        }                                                                          // 211
      }                                                                            // 212
    });                                                                            // 213
                                                                                   // 214
    // constraints specified in package dependencies                               // 215
    _.each(_.keys(analysis.reachablePackages), function (p) {                      // 216
      _.each(self.getVersions(p), function (v) {                                   // 217
        var pv = pvVar(p, v);                                                      // 218
        _.each(cache.getDependencyMap(p, v), function (dep) {                      // 219
          // `dep` is a CS.Dependency                                              // 220
          var p2 = dep.packageConstraint.package;                                  // 221
          if (input.isKnownPackage(p2) &&                                          // 222
              dep.packageConstraint.constraintString) {                            // 223
            analysis.constraints.push(new CS.Solver.Constraint(                    // 224
              pv, p2, dep.packageConstraint.versionConstraint,                     // 225
              "constraint#" + analysis.constraints.length));                       // 226
          }                                                                        // 227
        });                                                                        // 228
      });                                                                          // 229
    });                                                                            // 230
  });                                                                              // 231
                                                                                   // 232
  ////////// ANALYZE PRE-RELEASES                                                  // 233
                                                                                   // 234
  Profile.time("analyze pre-releases", function () {                               // 235
    var unanticipatedPrereleases = [];                                             // 236
    _.each(_.keys(analysis.reachablePackages), function (p) {                      // 237
      var anticipatedPrereleases = input.anticipatedPrereleases[p];                // 238
      _.each(self.getVersions(p), function (v) {                                   // 239
        if (/-/.test(v) && ! (anticipatedPrereleases &&                            // 240
                              _.has(anticipatedPrereleases, v))) {                 // 241
          unanticipatedPrereleases.push(pvVar(p, v));                              // 242
        }                                                                          // 243
      });                                                                          // 244
    });                                                                            // 245
    analysis.unanticipatedPrereleases = unanticipatedPrereleases;                  // 246
  });                                                                              // 247
};                                                                                 // 248
                                                                                   // 249
// A Step consists of a name, an array of terms, and an array of weights.          // 250
// Steps are optimized one by one.  Optimizing a Step means to find                // 251
// the minimum whole number value for the weighted sum of the terms,               // 252
// and then to enforce in the solver that the weighted sum be that number.         // 253
// Thus, when the Steps are optimized in sequence, earlier Steps take              // 254
// precedence and will stay minimized while later Steps are optimized.             // 255
//                                                                                 // 256
// A term can be a package name, a package version, or any other variable          // 257
// name or Logic formula.                                                          // 258
//                                                                                 // 259
// A weight is a non-negative integer.  The weights array can be a single          // 260
// weight (which is used for all terms).                                           // 261
//                                                                                 // 262
// The terms and weights arguments each default to [].  You can add terms          // 263
// with weights using addTerm.                                                     // 264
//                                                                                 // 265
// options is optional.                                                            // 266
CS.Solver.Step = function (name, terms, weights) {                                 // 267
  check(name, String);                                                             // 268
  terms = terms || [];                                                             // 269
  check(terms, [String]);                                                          // 270
  weights = (weights == null ? [] : weights);                                      // 271
  check(weights, Match.OneOf([Logic.WholeNumber], Logic.WholeNumber));             // 272
                                                                                   // 273
  this.name = name;                                                                // 274
                                                                                   // 275
  // mutable:                                                                      // 276
  this.terms = terms;                                                              // 277
  this.weights = weights;                                                          // 278
  this.optimum = null; // set when optimized                                       // 279
};                                                                                 // 280
                                                                                   // 281
// If weights is a single number, you can omit the weight argument.                // 282
// Adds a term.  If weight is 0, addTerm may skip it.                              // 283
CS.Solver.Step.prototype.addTerm = function (term, weight) {                       // 284
  if (weight == null) {                                                            // 285
    if (typeof this.weights !== 'number') {                                        // 286
      throw new Error("Must specify a weight");                                    // 287
    }                                                                              // 288
    weight = this.weights;                                                         // 289
  }                                                                                // 290
  check(weight, Logic.WholeNumber);                                                // 291
  if (weight !== 0) {                                                              // 292
    this.terms.push(term);                                                         // 293
    if (typeof this.weights === 'number') {                                        // 294
      if (weight !== this.weights) {                                               // 295
        throw new Error("Can't specify a different weight now: " +                 // 296
                        weight + " != " + this.weights);                           // 297
      }                                                                            // 298
    } else {                                                                       // 299
      this.weights.push(weight);                                                   // 300
    }                                                                              // 301
  }                                                                                // 302
};                                                                                 // 303
                                                                                   // 304
var DEBUG = false;                                                                 // 305
                                                                                   // 306
// Call as one of:                                                                 // 307
// * minimize(step, options)                                                       // 308
// * minimize([step1, step2, ...], options)                                        // 309
// * minimize(stepName, costTerms, costWeights, options)                           // 310
CS.Solver.prototype.minimize = function (step, options) {                          // 311
  var self = this;                                                                 // 312
                                                                                   // 313
  if (_.isArray(step)) {                                                           // 314
    // minimize([steps...], options)                                               // 315
    _.each(step, function (st) {                                                   // 316
      self.minimize(st, options);                                                  // 317
    });                                                                            // 318
    return;                                                                        // 319
  }                                                                                // 320
                                                                                   // 321
  if (typeof step === 'string') {                                                  // 322
    // minimize(stepName, costTerms, costWeights, options)                         // 323
    var stepName_ = arguments[0];                                                  // 324
    var costTerms_ = arguments[1];                                                 // 325
    var costWeights_ = arguments[2];                                               // 326
    var options_ = arguments[3];                                                   // 327
    if (costWeights_ && typeof costWeights_ === 'object' &&                        // 328
        ! _.isArray(costWeights_)) {                                               // 329
      options_ = costWeights_;                                                     // 330
      costWeights_ = null;                                                         // 331
    }                                                                              // 332
    var theStep = new CS.Solver.Step(                                              // 333
      stepName_, costTerms_, (costWeights_ == null ? 1 : costWeights_));           // 334
    self.minimize(theStep, options_);                                              // 335
    return;                                                                        // 336
  }                                                                                // 337
                                                                                   // 338
  // minimize(step, options);                                                      // 339
                                                                                   // 340
  self.Profile.time("minimize " + step.name, function () {                         // 341
                                                                                   // 342
    var logic = self.logic;                                                        // 343
                                                                                   // 344
    self.steps.push(step);                                                         // 345
    self.stepsByName[step.name] = step;                                            // 346
                                                                                   // 347
    if (DEBUG) {                                                                   // 348
      console.log("--- MINIMIZING " + step.name);                                  // 349
    }                                                                              // 350
                                                                                   // 351
    var costWeights = step.weights;                                                // 352
    var costTerms = step.terms;                                                    // 353
                                                                                   // 354
    self.setSolution(logic.minimize(                                               // 355
      self.solution, costTerms, costWeights, {                                     // 356
        progress: function (status, cost) {                                        // 357
          if (self.options.nudge) {                                                // 358
            self.options.nudge();                                                  // 359
          }                                                                        // 360
          if (DEBUG) {                                                             // 361
            if (status === 'improving') {                                          // 362
              console.log(cost + " ... trying to improve ...");                    // 363
            }                                                                      // 364
          }                                                                        // 365
        },                                                                         // 366
        strategy: (options && options.strategy)                                    // 367
      }));                                                                         // 368
                                                                                   // 369
    step.optimum = self.solution.getWeightedSum(costTerms, costWeights);           // 370
    if (DEBUG) {                                                                   // 371
      console.log(step.optimum + " is optimal");                                   // 372
                                                                                   // 373
      if (step.optimum) {                                                          // 374
        _.each(costTerms, function (t, i) {                                        // 375
          var w = (typeof costWeights === 'number' ? costWeights :                 // 376
                   costWeights[i]);                                                // 377
          if (w && self.solution.evaluate(t)) {                                    // 378
            console.log("    " + w + ": " + t);                                    // 379
          }                                                                        // 380
        });                                                                        // 381
      }                                                                            // 382
    }                                                                              // 383
  });                                                                              // 384
};                                                                                 // 385
                                                                                   // 386
// Determine the non-zero contributions to the cost function in `step`             // 387
// based on the current solution, returning a map from term (usually               // 388
// the name of a package or package version) to positive integer cost.             // 389
CS.Solver.prototype.getStepContributions = function (step) {                       // 390
  var self = this;                                                                 // 391
  var solution = self.solution;                                                    // 392
  var contributions = {};                                                          // 393
  var weights = step.weights;                                                      // 394
  _.each(step.terms, function (t, i) {                                             // 395
    var w = (typeof weights === 'number' ? weights : weights[i]);                  // 396
    if (w && self.solution.evaluate(t)) {                                          // 397
      contributions[t] = w;                                                        // 398
    }                                                                              // 399
  });                                                                              // 400
  return contributions;                                                            // 401
};                                                                                 // 402
                                                                                   // 403
var addCostsToSteps = function (package, versions, costs, steps) {                 // 404
  var pvs = _.map(versions, function (v) {                                         // 405
    return pvVar(package, v);                                                      // 406
  });                                                                              // 407
  for (var j = 0; j < steps.length; j++) {                                         // 408
    var step = steps[j];                                                           // 409
    var costList = costs[j];                                                       // 410
    if (costList.length !== versions.length) {                                     // 411
      throw new Error("Assertion failure: Bad lengths in addCostsToSteps");        // 412
    }                                                                              // 413
    for (var i = 0; i < versions.length; i++) {                                    // 414
      step.addTerm(pvs[i], costList[i]);                                           // 415
    }                                                                              // 416
  }                                                                                // 417
};                                                                                 // 418
                                                                                   // 419
// Get an array of "Steps" that, when minimized in order, optimizes                // 420
// the package version costs of `packages` (an array of String package             // 421
// names) according to `pricerMode`, which may be                                  // 422
// `CS.VersionPricer.MODE_UPDATE` or a similar mode constant.                      // 423
// Wraps `VersionPricer#priceVersions`, which is tasked with calculating           // 424
// the cost of every version of every package.  This function iterates             // 425
// over `packages` and puts the result into `Step` objects.                        // 426
CS.Solver.prototype.getVersionCostSteps = function (stepBaseName, packages,        // 427
                                                    pricerMode) {                  // 428
  var self = this;                                                                 // 429
  var major = new CS.Solver.Step(stepBaseName + '_major');                         // 430
  var minor = new CS.Solver.Step(stepBaseName + '_minor');                         // 431
  var patch = new CS.Solver.Step(stepBaseName + '_patch');                         // 432
  var rest = new CS.Solver.Step(stepBaseName + '_rest');                           // 433
                                                                                   // 434
  self.Profile.time(                                                               // 435
    "calculate " + stepBaseName + " version costs",                                // 436
    function () {                                                                  // 437
      _.each(packages, function (p) {                                              // 438
        var versions = self.getVersions(p);                                        // 439
        var costs = self.pricer.priceVersions(versions, pricerMode);               // 440
        addCostsToSteps(p, versions, costs, [major, minor, patch, rest]);          // 441
      });                                                                          // 442
    });                                                                            // 443
                                                                                   // 444
  return [major, minor, patch, rest];                                              // 445
};                                                                                 // 446
                                                                                   // 447
// Like `getVersionCostSteps`, but wraps                                           // 448
// `VersionPricer#priceVersionsWithPrevious` instead of `#priceVersions`.          // 449
// The cost function is "distance" from the previous versions passed in            // 450
// as `packageAndVersion`.  (Actually it's a complicated function of the           // 451
// previous and new version.)                                                      // 452
CS.Solver.prototype.getVersionDistanceSteps = function (stepBaseName,              // 453
                                                        packageAndVersions,        // 454
                                                        takePatches) {             // 455
  var self = this;                                                                 // 456
                                                                                   // 457
  var incompat = new CS.Solver.Step(stepBaseName + '_incompat');                   // 458
  var major = new CS.Solver.Step(stepBaseName + '_major');                         // 459
  var minor = new CS.Solver.Step(stepBaseName + '_minor');                         // 460
  var patch = new CS.Solver.Step(stepBaseName + '_patch');                         // 461
  var rest = new CS.Solver.Step(stepBaseName + '_rest');                           // 462
                                                                                   // 463
  self.Profile.time(                                                               // 464
    "calculate " + stepBaseName + " distance costs",                               // 465
    function () {                                                                  // 466
      _.each(packageAndVersions, function (pvArg) {                                // 467
        var package = pvArg.package;                                               // 468
        var previousVersion = pvArg.version;                                       // 469
        var versions = self.getVersions(package);                                  // 470
        var costs = self.pricer.priceVersionsWithPrevious(                         // 471
          versions, previousVersion, takePatches);                                 // 472
        addCostsToSteps(package, versions, costs,                                  // 473
                        [incompat, major, minor, patch, rest]);                    // 474
      });                                                                          // 475
    });                                                                            // 476
                                                                                   // 477
  return [incompat, major, minor, patch, rest];                                    // 478
};                                                                                 // 479
                                                                                   // 480
CS.Solver.prototype.currentVersionMap = function () {                              // 481
  var self = this;                                                                 // 482
  var pvs = [];                                                                    // 483
  _.each(self.solution.getTrueVars(), function (x) {                               // 484
    if (x.indexOf(' ') >= 0) {                                                     // 485
      // all variables with spaces in them are PackageAndVersions                  // 486
      var pv = CS.PackageAndVersion.fromString(x);                                 // 487
      pvs.push(pv);                                                                // 488
    }                                                                              // 489
  });                                                                              // 490
                                                                                   // 491
  var versionMap = {};                                                             // 492
  _.each(pvs, function (pv) {                                                      // 493
    if (_.has(versionMap, pv.package)) {                                           // 494
      throw new Error("Assertion failure: Selected two versions of " +             // 495
                      pv.package + ", " +versionMap[pv.package] +                  // 496
                      " and " + pv.version);                                       // 497
    }                                                                              // 498
    versionMap[pv.package] = pv.version;                                           // 499
  });                                                                              // 500
                                                                                   // 501
  return versionMap;                                                               // 502
};                                                                                 // 503
                                                                                   // 504
// Called to re-assign `self.solution` after a call to `self.logic.solve()`,       // 505
// `solveAssuming`, or `minimize`.                                                 // 506
CS.Solver.prototype.setSolution = function (solution) {                            // 507
  var self = this;                                                                 // 508
  self.solution = solution;                                                        // 509
  if (! self.solution) {                                                           // 510
    throw new Error("Unexpected unsatisfiability");                                // 511
  }                                                                                // 512
  self.solution.ignoreUnknownVariables = true;                                     // 513
};                                                                                 // 514
                                                                                   // 515
CS.Solver.prototype.getAnswer = function (options) {                               // 516
  var self = this;                                                                 // 517
  return self.Profile.time("Solver#getAnswer", function () {                       // 518
    return self._getAnswer(options);                                               // 519
  });                                                                              // 520
};                                                                                 // 521
                                                                                   // 522
CS.Solver.prototype._getAnswer = function (options) {                              // 523
  var self = this;                                                                 // 524
  var input = self.input;                                                          // 525
  var analysis = self.analysis;                                                    // 526
  var cache = input.catalogCache;                                                  // 527
  var allAnswers = (options && options.allAnswers); // for tests                   // 528
  var Profile = self.Profile;                                                      // 529
                                                                                   // 530
  var logic;                                                                       // 531
  Profile.time("new Logic.Solver (MiniSat start-up)", function () {                // 532
    logic = self.logic = new Logic.Solver();                                       // 533
  });                                                                              // 534
                                                                                   // 535
  // require root dependencies                                                     // 536
  Profile.time("require root dependencies", function () {                          // 537
    _.each(input.dependencies, function (p) {                                      // 538
      logic.require(p);                                                            // 539
    });                                                                            // 540
  });                                                                              // 541
                                                                                   // 542
  // generate package version variables for known, reachable packages              // 543
  Profile.time("generate package variables", function () {                         // 544
    _.each(_.keys(analysis.reachablePackages), function (p) {                      // 545
      if (! _.has(analysis.packagesWithNoAllowedVersions, p)) {                    // 546
        var versionVars = _.map(self.getVersions(p),                               // 547
                                function (v) {                                     // 548
                                  return pvVar(p, v);                              // 549
                                });                                                // 550
        // At most one of ["foo 1.0.0", "foo 1.0.1", ...] is true.                 // 551
        logic.require(Logic.atMostOne(versionVars));                               // 552
        // The variable "foo" is true if and only if at least one of the           // 553
        // variables ["foo 1.0.0", "foo 1.0.1", ...] is true.                      // 554
        logic.require(Logic.equiv(p, Logic.or(versionVars)));                      // 555
      }                                                                            // 556
    });                                                                            // 557
  });                                                                              // 558
                                                                                   // 559
  // generate strong dependency requirements                                       // 560
  Profile.time("generate dependency requirements", function () {                   // 561
    _.each(_.keys(analysis.reachablePackages), function (p) {                      // 562
      _.each(self.getVersions(p), function (v) {                                   // 563
        _.each(cache.getDependencyMap(p, v), function (dep) {                      // 564
          // `dep` is a CS.Dependency                                              // 565
          if (! dep.isWeak) {                                                      // 566
            var p2 = dep.packageConstraint.package;                                // 567
            logic.require(Logic.implies(pvVar(p, v), p2));                         // 568
          }                                                                        // 569
        });                                                                        // 570
      });                                                                          // 571
    });                                                                            // 572
  });                                                                              // 573
                                                                                   // 574
  // generate constraints -- but technically don't enforce them, because           // 575
  // we haven't forced the conflictVars to be false                                // 576
  Profile.time("generate constraints", function () {                               // 577
    _.each(analysis.constraints, function (c) {                                    // 578
      // We logically require that EITHER a constraint is marked as a              // 579
      // conflict OR it comes from a package version that is not selected          // 580
      // OR its constraint formula must be true.                                   // 581
      // (The constraint formula says that if toPackage is selected,               // 582
      // then a version of it that satisfies our constraint must be true.)         // 583
      logic.require(                                                               // 584
        Logic.or(c.conflictVar,                                                    // 585
                 c.fromVar ? Logic.not(c.fromVar) : [],                            // 586
                 self.getConstraintFormula(c.toPackage, c.vConstraint)));          // 587
    });                                                                            // 588
  });                                                                              // 589
                                                                                   // 590
  // Establish the invariant of self.solution being a valid solution.              // 591
  // From now on, if we add some new logical requirement to the solver             // 592
  // that isn't necessarily true of `self.solution`, we must                       // 593
  // recalculate `self.solution` and pass the new value to                         // 594
  // self.setSolution.  It is our job to obtain the new solution in a              // 595
  // way that ensures the solution exists and doesn't put the solver               // 596
  // in an unsatisfiable state.  There are several ways to do this:                // 597
  //                                                                               // 598
  // * Calling `logic.solve()` and immediately throwing a fatal error              // 599
  //   if there's no solution (not calling `setSolution` at all)                   // 600
  // * Calling `logic.solve()` in a situation where we know we have                // 601
  //   not made the problem unsatisfiable                                          // 602
  // * Calling `logic.solveAssuming(...)` and checking the result, only            // 603
  //   using the solution if it exists                                             // 604
  // * Calling `minimize()`, which always maintains satisfiability                 // 605
                                                                                   // 606
  Profile.time("pre-solve", function () {                                          // 607
    self.setSolution(logic.solve());                                               // 608
  });                                                                              // 609
  // There is always a solution at this point, namely,                             // 610
  // select all packages (including unknown packages), select                      // 611
  // any version of each known package (excluding packages with                    // 612
  // "no allowed versions"), and set all conflictVars                              // 613
  // to true.                                                                      // 614
                                                                                   // 615
  // Forbid packages with no versions allowed by top-level constraints,            // 616
  // which we didn't do earlier because we needed to establish an                  // 617
  // initial solution before asking the solver if it's possible to                 // 618
  // not use these packages.                                                       // 619
  Profile.time("forbid packages with no matching versions", function () {          // 620
    _.each(analysis.packagesWithNoAllowedVersions, function (constrs, p) {         // 621
      var newSolution = logic.solveAssuming(Logic.not(p));                         // 622
      if (newSolution) {                                                           // 623
        self.setSolution(newSolution);                                             // 624
        logic.forbid(p);                                                           // 625
      } else {                                                                     // 626
        self.errors.push(                                                          // 627
          'No version of ' + p + ' satisfies all constraints: ' +                  // 628
            _.map(constrs, function (constr) {                                     // 629
              return '@' + constr.constraintString;                                // 630
            }).join(', '));                                                        // 631
      }                                                                            // 632
    });                                                                            // 633
    self.throwAnyErrors();                                                         // 634
  });                                                                              // 635
                                                                                   // 636
  // try not to use any unknown packages.  If the minimum is greater               // 637
  // than 0, we'll throw an error later, after we apply the constraints            // 638
  // and the cost function, so that we can explain the problem to the              // 639
  // user in a convincing way.                                                     // 640
  self.minimize('unknown_packages', _.keys(analysis.unknownPackages));             // 641
                                                                                   // 642
  // try not to set the conflictVar on any constraint.  If the minimum             // 643
  // is greater than 0, we'll throw an error later, after we've run the            // 644
  // cost function, so we can show a better error.                                 // 645
  // If there are conflicts, this minimization can be time-consuming               // 646
  // (several seconds or more).  The strategy 'bottom-up' helps by                 // 647
  // looking for solutions with few conflicts first.                               // 648
  self.minimize('conflicts', _.pluck(analysis.constraints, 'conflictVar'),         // 649
                { strategy: 'bottom-up' });                                        // 650
                                                                                   // 651
  // Try not to use "unanticipated" prerelease versions                            // 652
  self.minimize('unanticipated_prereleases',                                       // 653
                analysis.unanticipatedPrereleases);                                // 654
                                                                                   // 655
  var previousRootSteps = self.getVersionDistanceSteps(                            // 656
    'previous_root', analysis.previousRootDepVersions);                            // 657
  // the "previous_root_incompat" step                                             // 658
  var previousRootIncompat = previousRootSteps[0];                                 // 659
  // the "previous_root_major", "previous_root_minor", etc. steps                  // 660
  var previousRootVersionParts = previousRootSteps.slice(1);                       // 661
                                                                                   // 662
  var toUpdate = _.filter(input.upgrade, function (p) {                            // 663
    return analysis.reachablePackages[p] === true;                                 // 664
  });                                                                              // 665
                                                                                   // 666
  if (! input.allowIncompatibleUpdate) {                                           // 667
    // make sure packages that are being updated can still count as                // 668
    // a previous_root for the purposes of previous_root_incompat                  // 669
    Profile.time("add terms to previous_root_incompat", function () {              // 670
      _.each(toUpdate, function (p) {                                              // 671
        if (input.isRootDependency(p) && input.isInPreviousSolution(p)) {          // 672
          var parts = self.pricer.partitionVersions(                               // 673
            self.getVersions(p), input.previousSolution[p]);                       // 674
          _.each(parts.older.concat(parts.higherMajor), function (v) {             // 675
            previousRootIncompat.addTerm(pvVar(p, v), 1);                          // 676
          });                                                                      // 677
        }                                                                          // 678
      });                                                                          // 679
    });                                                                            // 680
                                                                                   // 681
    // Enforce that we don't make breaking changes to your root dependencies,      // 682
    // unless you pass --allow-incompatible-update.  It will actually be enforced  // 683
    // farther down, but for now, we want to apply this constraint before handling // 684
    // updates.                                                                    // 685
    self.minimize(previousRootIncompat);                                           // 686
  }                                                                                // 687
                                                                                   // 688
  self.minimize(self.getVersionCostSteps(                                          // 689
    'update', toUpdate, CS.VersionPricer.MODE_UPDATE));                            // 690
                                                                                   // 691
  if (input.allowIncompatibleUpdate) {                                             // 692
    // If you pass `--allow-incompatible-update`, we will still try to minimize    // 693
    // version changes to root deps that break compatibility, but with a lower     // 694
    // priority than taking as-new-as-possible versions for `meteor update`.       // 695
    self.minimize(previousRootIncompat);                                           // 696
  }                                                                                // 697
                                                                                   // 698
  self.minimize(previousRootVersionParts);                                         // 699
                                                                                   // 700
  var otherPrevious = _.filter(_.map(input.previousSolution, function (v, p) {     // 701
    return new CS.PackageAndVersion(p, v);                                         // 702
  }), function (pv) {                                                              // 703
    var p = pv.package;                                                            // 704
    return analysis.reachablePackages[p] === true &&                               // 705
      ! input.isRootDependency(p);                                                 // 706
  });                                                                              // 707
                                                                                   // 708
  self.minimize(self.getVersionDistanceSteps(                                      // 709
    'previous_indirect', otherPrevious,                                            // 710
    input.upgradeIndirectDepPatchVersions));                                       // 711
                                                                                   // 712
  var newRootDeps = _.filter(input.dependencies, function (p) {                    // 713
    return ! input.isInPreviousSolution(p);                                        // 714
  });                                                                              // 715
                                                                                   // 716
  self.minimize(self.getVersionCostSteps(                                          // 717
    'new_root', newRootDeps, CS.VersionPricer.MODE_UPDATE));                       // 718
                                                                                   // 719
  // Lock down versions of all root, previous, and updating packages that          // 720
  // are currently selected.  The reason to do this is to save the solver          // 721
  // a bunch of work (i.e. improve performance) by not asking it to                // 722
  // optimize the "unimportant" packages while also twiddling the versions         // 723
  // of the "important" packages, which would just multiply the search space.      // 724
  //                                                                               // 725
  // The important packages are root deps, packages in the previous solution,      // 726
  // and packages being upgraded.  At this point, we either have unique            // 727
  // versions for them, or else there is some kind of trade-off, like a            // 728
  // situation where raising the version of one package and lowering the           // 729
  // version of another produces the same cost -- a tie between two solutions.     // 730
  // If we have a tie, it probably won't be broken by the unimportant              // 731
  // packages, so we'll end up going with whatever we picked anyway.  (Note        // 732
  // that we have already taken the unimportant packages into account in that      // 733
  // we are only considering solutions where SOME versions can be chosen for       // 734
  // them.)  Even if optimizing the unimportant packages (coming up next)          // 735
  // was able to break a tie in the important packages, we care so little          // 736
  // about the versions of the unimportant packages that it's a very weak          // 737
  // signal.  In other words, the user might be better off with some tie-breaker   // 738
  // that looks only at the important packages anyway.                             // 739
  Profile.time("lock down important versions", function () {                       // 740
    _.each(self.currentVersionMap(), function (v, package) {                       // 741
      if (input.isRootDependency(package) ||                                       // 742
          input.isInPreviousSolution(package) ||                                   // 743
          input.isUpgrading(package)) {                                            // 744
        logic.require(Logic.implies(package, pvVar(package, v)));                  // 745
      }                                                                            // 746
    });                                                                            // 747
  });                                                                              // 748
                                                                                   // 749
  // new, indirect packages are the lowest priority                                // 750
  var otherPackages = [];                                                          // 751
  _.each(_.keys(analysis.reachablePackages), function (p) {                        // 752
    if (! (input.isRootDependency(p) ||                                            // 753
           input.isInPreviousSolution(p) ||                                        // 754
           input.isUpgrading(p))) {                                                // 755
      otherPackages.push(p);                                                       // 756
    }                                                                              // 757
  });                                                                              // 758
                                                                                   // 759
  self.minimize(self.getVersionCostSteps(                                          // 760
    'new_indirect', otherPackages,                                                 // 761
    CS.VersionPricer.MODE_GRAVITY_WITH_PATCHES));                                  // 762
                                                                                   // 763
  self.minimize('total_packages', _.keys(analysis.reachablePackages));             // 764
                                                                                   // 765
  // throw errors about unknown packages                                           // 766
  if (self.stepsByName['unknown_packages'].optimum > 0) {                          // 767
    Profile.time("generate error for unknown packages", function () {              // 768
      var unknownPackages = _.keys(analysis.unknownPackages);                      // 769
      var unknownPackagesNeeded = _.filter(unknownPackages, function (p) {         // 770
        return self.solution.evaluate(p);                                          // 771
      });                                                                          // 772
      _.each(unknownPackagesNeeded, function (p) {                                 // 773
        var requirers = _.filter(analysis.unknownPackages[p], function (pv) {      // 774
          return self.solution.evaluate(pv);                                       // 775
        });                                                                        // 776
        var errorStr = 'unknown package: ' + p;                                    // 777
        _.each(requirers, function (pv) {                                          // 778
          errorStr += '\nRequired by: ' + pv;                                      // 779
        });                                                                        // 780
        self.errors.push(errorStr);                                                // 781
      });                                                                          // 782
    });                                                                            // 783
    self.throwAnyErrors();                                                         // 784
  }                                                                                // 785
                                                                                   // 786
  // throw errors about conflicts                                                  // 787
  if (self.stepsByName['conflicts'].optimum > 0) {                                 // 788
    self.throwConflicts();                                                         // 789
  }                                                                                // 790
                                                                                   // 791
  if ((! input.allowIncompatibleUpdate) &&                                         // 792
      self.stepsByName['previous_root_incompat'].optimum > 0) {                    // 793
    // we have some "incompatible root changes", where we needed to change a       // 794
    // version of a root dependency to a new version incompatible with the         // 795
    // original, but --allow-incompatible-update hasn't been passed in.            // 796
    // these are in the form of PackageAndVersion strings that we need.            // 797
    var incompatRootChanges = _.keys(self.getStepContributions(                    // 798
      self.stepsByName['previous_root_incompat']));                                // 799
                                                                                   // 800
    Profile.time("generate errors for incompatible root change", function () {     // 801
      var numActualErrors = 0;                                                     // 802
      _.each(incompatRootChanges, function (pvStr) {                               // 803
        var pv = CS.PackageAndVersion.fromString(pvStr);                           // 804
        // exclude packages with top-level equality constraints (added by user     // 805
        // or by the tool pinning a version)                                       // 806
        if (! _.has(analysis.topLevelEqualityConstrainedPackages, pv.package)) {   // 807
          var prevVersion = input.previousSolution[pv.package];                    // 808
          self.errors.push(                                                        // 809
            'Potentially incompatible change required to ' +                       // 810
              'top-level dependency: ' +                                           // 811
              pvStr + ', was ' + prevVersion + '.\n' +                             // 812
              self.listConstraintsOnPackage(pv.package));                          // 813
          numActualErrors++;                                                       // 814
        }                                                                          // 815
      });                                                                          // 816
      if (numActualErrors) {                                                       // 817
        self.errors.push(                                                          // 818
          'To allow potentially incompatible changes to top-level ' +              // 819
            'dependencies, you must pass --allow-incompatible-update ' +           // 820
            'on the command line.');                                               // 821
      }                                                                            // 822
    });                                                                            // 823
    self.throwAnyErrors();                                                         // 824
  }                                                                                // 825
                                                                                   // 826
  var result = {                                                                   // 827
    neededToUseUnanticipatedPrereleases: (                                         // 828
      self.stepsByName['unanticipated_prereleases'].optimum > 0),                  // 829
    answer: Profile.time("generate version map", function () {                     // 830
      return self.currentVersionMap();                                             // 831
    })                                                                             // 832
  };                                                                               // 833
                                                                                   // 834
  if (allAnswers) {                                                                // 835
    Profile.time("generate all answers", function () {                             // 836
      var allAnswersList = [result.answer];                                        // 837
      var nextAnswer = function () {                                               // 838
        var formula = self.solution.getFormula();                                  // 839
        var newSolution = logic.solveAssuming(Logic.not(formula));                 // 840
        if (newSolution) {                                                         // 841
          self.setSolution(newSolution);                                           // 842
          logic.forbid(formula);                                                   // 843
        }                                                                          // 844
        return newSolution;                                                        // 845
      };                                                                           // 846
      while (nextAnswer()) {                                                       // 847
        allAnswersList.push(self.currentVersionMap());                             // 848
      }                                                                            // 849
      result.allAnswers = allAnswersList;                                          // 850
    });                                                                            // 851
  };                                                                               // 852
                                                                                   // 853
  return result;                                                                   // 854
};                                                                                 // 855
                                                                                   // 856
// Get a list of package-version variables that satisfy a given constraint.        // 857
var getOkVersions = function (toPackage, vConstraint, targetVersions) {            // 858
  return _.compact(_.map(targetVersions, function (v) {                            // 859
    if (CS.isConstraintSatisfied(toPackage, vConstraint, v)) {                     // 860
      return pvVar(toPackage, v);                                                  // 861
    } else {                                                                       // 862
      return null;                                                                 // 863
    }                                                                              // 864
  }));                                                                             // 865
};                                                                                 // 866
                                                                                   // 867
// The CS.Solver constructor turns this into a memoized method.                    // 868
// Memoizing the Formula object reduces clause generation a lot.                   // 869
var _getConstraintFormula = function (toPackage, vConstraint) {                    // 870
  var self = this;                                                                 // 871
                                                                                   // 872
  var targetVersions = self.getVersions(toPackage);                                // 873
  var okVersions = getOkVersions(toPackage, vConstraint, targetVersions);          // 874
                                                                                   // 875
  if (okVersions.length === targetVersions.length) {                               // 876
    return Logic.TRUE;                                                             // 877
  } else {                                                                         // 878
    return Logic.or(Logic.not(toPackage), okVersions);                             // 879
  }                                                                                // 880
};                                                                                 // 881
                                                                                   // 882
CS.Solver.prototype.listConstraintsOnPackage = function (package) {                // 883
  var self = this;                                                                 // 884
  var constraints = self.analysis.constraints;                                     // 885
                                                                                   // 886
  var result = 'Constraints on package "' + package + '":';                        // 887
                                                                                   // 888
  _.each(constraints, function (c) {                                               // 889
    if (c.toPackage === package) {                                                 // 890
      var paths;                                                                   // 891
      if (c.fromVar) {                                                             // 892
        paths = self.getPathsToPackageVersion(                                     // 893
          CS.PackageAndVersion.fromString(c.fromVar));                             // 894
      } else {                                                                     // 895
        paths = [['top level']];                                                   // 896
      }                                                                            // 897
      _.each(paths, function (path) {                                              // 898
        result += '\n* ' + (new PV.PackageConstraint(                              // 899
          package, c.vConstraint.raw)) + ' <- ' + path.join(' <- ');               // 900
      });                                                                          // 901
    }                                                                              // 902
  });                                                                              // 903
                                                                                   // 904
  return result;                                                                   // 905
};                                                                                 // 906
                                                                                   // 907
CS.Solver.prototype.throwConflicts = function () {                                 // 908
  var self = this;                                                                 // 909
                                                                                   // 910
  var solution = self.solution;                                                    // 911
  var constraints = self.analysis.constraints;                                     // 912
                                                                                   // 913
  self.Profile.time("generate error about conflicts", function () {                // 914
    _.each(constraints, function (c) {                                             // 915
      // c is a CS.Solver.Constraint                                               // 916
      if (solution.evaluate(c.conflictVar)) {                                      // 917
        // skipped this constraint                                                 // 918
        var possibleVersions = self.getVersions(c.toPackage);                      // 919
        var chosenVersion = _.find(possibleVersions, function (v) {                // 920
          return solution.evaluate(pvVar(c.toPackage, v));                         // 921
        });                                                                        // 922
        if (! chosenVersion) {                                                     // 923
          // this can't happen, because for a constraint to be a problem,          // 924
          // we must have chosen some version of the package it applies to!        // 925
          throw new Error("Internal error: Version not found");                    // 926
        }                                                                          // 927
        var error = (                                                              // 928
          'Conflict: Constraint ' + (new PV.PackageConstraint(                     // 929
            c.toPackage, c.vConstraint)) +                                         // 930
            ' is not satisfied by ' + c.toPackage + ' ' + chosenVersion + '.');    // 931
                                                                                   // 932
        error += '\n' + self.listConstraintsOnPackage(c.toPackage);                // 933
                                                                                   // 934
        self.errors.push(error);                                                   // 935
      }                                                                            // 936
    });                                                                            // 937
  });                                                                              // 938
                                                                                   // 939
  // always throws, never returns                                                  // 940
  self.throwAnyErrors();                                                           // 941
                                                                                   // 942
  throw new Error("Internal error: conflicts could not be explained");             // 943
};                                                                                 // 944
                                                                                   // 945
// Takes a PackageVersion and returns an array of arrays of PackageVersions.       // 946
// If the `packageVersion` is not selected in `self.solution`, returns             // 947
// an empty array.  Otherwise, returns an array of all paths from                  // 948
// root dependencies to the package, in reverse order.  In other words,            // 949
// the first element of each path is `packageVersion`,                             // 950
// and the last element is the selected version of a root dependency.              // 951
//                                                                                 // 952
// Ok, it isn't all paths.  Because that would be crazy (combinatorial             // 953
// explosion).  It stops at root dependencies and tries to filter out              // 954
// ones that are definitely longer than another.                                   // 955
CS.Solver.prototype.getPathsToPackageVersion = function (packageAndVersion) {      // 956
  check(packageAndVersion, CS.PackageAndVersion);                                  // 957
  var self = this;                                                                 // 958
  var input = self.input;                                                          // 959
  var cache = input.catalogCache;                                                  // 960
  var solution = self.solution;                                                    // 961
                                                                                   // 962
  var versionMap = self.currentVersionMap();                                       // 963
  var hasDep = function (p1, p2) {                                                 // 964
    // Include weak dependencies, because their constraints matter.                // 965
    return _.has(cache.getDependencyMap(p1, versionMap[p1]), p2);                  // 966
  };                                                                               // 967
  var allPackages = _.keys(versionMap);                                            // 968
                                                                                   // 969
  var getPaths = function (pv, _ignorePackageSet) {                                // 970
    if (! solution.evaluate(pv.toString())) {                                      // 971
      return [];                                                                   // 972
    }                                                                              // 973
    var package = pv.package;                                                      // 974
                                                                                   // 975
    if (input.isRootDependency(package)) {                                         // 976
      return [[pv]];                                                               // 977
    }                                                                              // 978
                                                                                   // 979
    var newIgnorePackageSet = _.clone(_ignorePackageSet);                          // 980
    newIgnorePackageSet[package] = true;                                           // 981
                                                                                   // 982
    var paths = [];                                                                // 983
    var shortestLength = null;                                                     // 984
                                                                                   // 985
    _.each(allPackages, function (p) {                                             // 986
      if ((! _.has(newIgnorePackageSet, p)) &&                                     // 987
          solution.evaluate(p) &&                                                  // 988
          hasDep(p, package)) {                                                    // 989
        var newPV = new CS.PackageAndVersion(p, versionMap[p]);                    // 990
        _.each(getPaths(newPV, newIgnorePackageSet), function (path) {             // 991
          var newPath = [pv].concat(path);                                         // 992
          if ((! paths.length) || newPath.length < shortestLength) {               // 993
            paths.push(newPath);                                                   // 994
            shortestLength = newPath.length;                                       // 995
          }                                                                        // 996
        });                                                                        // 997
      }                                                                            // 998
    });                                                                            // 999
                                                                                   // 1000
    return paths;                                                                  // 1001
  };                                                                               // 1002
                                                                                   // 1003
  return getPaths(packageAndVersion, {});                                          // 1004
};                                                                                 // 1005
                                                                                   // 1006
                                                                                   // 1007
CS.Solver.Constraint = function (fromVar, toPackage, vConstraint, conflictVar) {   // 1008
  this.fromVar = fromVar;                                                          // 1009
  this.toPackage = toPackage;                                                      // 1010
  this.vConstraint = vConstraint;                                                  // 1011
  this.conflictVar = conflictVar;                                                  // 1012
                                                                                   // 1013
  // this.fromVar is a return value of pvVar(p, v), or null for a                  // 1014
  // top-level constraint                                                          // 1015
  check(this.fromVar, Match.OneOf(String, null));                                  // 1016
  check(this.toPackage, String); // package name                                   // 1017
  check(this.vConstraint, PV.VersionConstraint);                                   // 1018
  check(this.conflictVar, String);                                                 // 1019
};                                                                                 // 1020
                                                                                   // 1021
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

/////////////////////////////////////////////////////////////////////////////////////
//                                                                                 //
// packages/constraint-solver/constraint-solver.js                                 //
//                                                                                 //
/////////////////////////////////////////////////////////////////////////////////////
                                                                                   //
var PV = PackageVersion;                                                           // 1
var CS = ConstraintSolver;                                                         // 2
                                                                                   // 3
// This is the entry point for the constraint-solver package.  The tool            // 4
// creates a ConstraintSolver.PackagesResolver and calls .resolve on it.           // 5
                                                                                   // 6
CS.PackagesResolver = function (catalog, options) {                                // 7
  var self = this;                                                                 // 8
                                                                                   // 9
  self.catalog = catalog;                                                          // 10
  self.catalogCache = new CS.CatalogCache();                                       // 11
  self.catalogLoader = new CS.CatalogLoader(self.catalog, self.catalogCache);      // 12
                                                                                   // 13
  self._options = {                                                                // 14
    nudge: options && options.nudge,                                               // 15
    Profile: options && options.Profile                                            // 16
  };                                                                               // 17
};                                                                                 // 18
                                                                                   // 19
// dependencies - an array of string names of packages (not slices)                // 20
// constraints - an array of PV.PackageConstraints                                 // 21
// options:                                                                        // 22
//  - upgrade - list of dependencies for which upgrade is prioritized higher       // 23
//    than keeping the old version                                                 // 24
//  - previousSolution - mapping from package name to a version that was used in   // 25
//    the previous constraint solver run                                           // 26
//  - anticipatedPrereleases: mapping from package name to version to true;        // 27
//    included versions are the only pre-releases that are allowed to match        // 28
//    constraints that don't specifically name them during the "try not to         // 29
//    use unanticipated pre-releases" pass                                         // 30
//  - allowIncompatibleUpdate: allows choosing versions of                         // 31
//    root dependencies that are incompatible with the previous solution,          // 32
//    if necessary to satisfy all constraints                                      // 33
//  - upgradeIndirectDepPatchVersions: also upgrade indirect dependencies          // 34
//    to newer patch versions, proactively                                         // 35
//  - missingPreviousVersionIsError - throw an error if a package version in       // 36
//    previousSolution is not found in the catalog                                 // 37
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,       // 38
                                                  options) {                       // 39
  var self = this;                                                                 // 40
  options = options || {};                                                         // 41
  var Profile = (self._options.Profile || CS.DummyProfile);                        // 42
                                                                                   // 43
  var input;                                                                       // 44
  Profile.time("new CS.Input", function () {                                       // 45
    input = new CS.Input(dependencies, constraints, self.catalogCache,             // 46
                         _.pick(options,                                           // 47
                                'upgrade',                                         // 48
                                'anticipatedPrereleases',                          // 49
                                'previousSolution',                                // 50
                                'allowIncompatibleUpdate',                         // 51
                                'upgradeIndirectDepPatchVersions'));               // 52
  });                                                                              // 53
                                                                                   // 54
  Profile.time(                                                                    // 55
    "Input#loadFromCatalog (sqlite)",                                              // 56
    function () {                                                                  // 57
      input.loadFromCatalog(self.catalogLoader);                                   // 58
    });                                                                            // 59
                                                                                   // 60
  if (options.previousSolution && options.missingPreviousVersionIsError) {         // 61
    Profile.time("check for previous versions in catalog", function () {           // 62
      _.each(options.previousSolution, function (version, package) {               // 63
        if (! input.catalogCache.hasPackageVersion(package, version)) {            // 64
          CS.throwConstraintSolverError(                                           // 65
            "Package version not in catalog: " + package + " " + version);         // 66
        }                                                                          // 67
      });                                                                          // 68
    });                                                                            // 69
  }                                                                                // 70
                                                                                   // 71
  return CS.PackagesResolver._resolveWithInput(input, {                            // 72
    nudge: self._options.nudge,                                                    // 73
    Profile: self._options.Profile                                                 // 74
  });                                                                              // 75
};                                                                                 // 76
                                                                                   // 77
// Exposed for tests.                                                              // 78
//                                                                                 // 79
// Options (all optional):                                                         // 80
// - nudge (function to be called when possible to "nudge" the progress spinner)   // 81
// - allAnswers (for testing, calculate all possible answers and put an extra      // 82
//   property named "allAnswers" on the result)                                    // 83
// - Profile (the profiler interface in `tools/profile.js`)                        // 84
CS.PackagesResolver._resolveWithInput = function (input, options) {                // 85
  options = options || {};                                                         // 86
                                                                                   // 87
  if (Meteor.isServer &&                                                           // 88
      process.env['METEOR_PRINT_CONSTRAINT_SOLVER_INPUT']) {                       // 89
    console.log("CONSTRAINT_SOLVER_INPUT = ");                                     // 90
    console.log(JSON.stringify(input.toJSONable(), null, 2));                      // 91
  }                                                                                // 92
                                                                                   // 93
  var solver;                                                                      // 94
  (options.Profile || CS.DummyProfile).time("new CS.Solver", function () {         // 95
    solver = new CS.Solver(input, {                                                // 96
      nudge: options.nudge,                                                        // 97
      Profile: options.Profile                                                     // 98
    });                                                                            // 99
  });                                                                              // 100
                                                                                   // 101
  // Disable runtime type checks (they slow things down by a factor of 3)          // 102
  return Logic._disablingTypeChecks(function () {                                  // 103
    var result = solver.getAnswer({                                                // 104
      allAnswers: options.allAnswers                                               // 105
    });                                                                            // 106
    // if we're here, no conflicts were found (or an error would have              // 107
    // been thrown)                                                                // 108
    return result;                                                                 // 109
  });                                                                              // 110
};                                                                                 // 111
                                                                                   // 112
                                                                                   // 113
// - package: String package name                                                  // 114
// - vConstraint: a PackageVersion.VersionConstraint, or an object                 // 115
//   with an `alternatives` property lifted from one.                              // 116
// - version: version String                                                       // 117
CS.isConstraintSatisfied = function (package, vConstraint, version) {              // 118
  return _.some(vConstraint.alternatives, function (simpleConstraint) {            // 119
    var type = simpleConstraint.type;                                              // 120
                                                                                   // 121
    if (type === "any-reasonable") {                                               // 122
      return true;                                                                 // 123
    } else if (type === "exactly") {                                               // 124
      var cVersion = simpleConstraint.versionString;                               // 125
      return (cVersion === version);                                               // 126
    } else if (type === 'compatible-with') {                                       // 127
      var cv = PV.parse(simpleConstraint.versionString);                           // 128
      var v = PV.parse(version);                                                   // 129
                                                                                   // 130
      // If the candidate version is less than the version named in the            // 131
      // constraint, we are not satisfied.                                         // 132
      if (PV.lessThan(v, cv)) {                                                    // 133
        return false;                                                              // 134
      }                                                                            // 135
                                                                                   // 136
      // To be compatible, the two versions must have the same major version       // 137
      // number.                                                                   // 138
      if (v.major !== cv.major) {                                                  // 139
        return false;                                                              // 140
      }                                                                            // 141
                                                                                   // 142
      return true;                                                                 // 143
    } else {                                                                       // 144
      throw Error("Unknown constraint type: " + type);                             // 145
    }                                                                              // 146
  });                                                                              // 147
};                                                                                 // 148
                                                                                   // 149
CS.throwConstraintSolverError = function (message) {                               // 150
  var e = new Error(message);                                                      // 151
  e.constraintSolverError = true;                                                  // 152
  throw e;                                                                         // 153
};                                                                                 // 154
                                                                                   // 155
// Implements the Profile interface (as we use it) but doesn't do                  // 156
// anything.                                                                       // 157
CS.DummyProfile = function (bucket, f) {                                           // 158
  return f;                                                                        // 159
};                                                                                 // 160
CS.DummyProfile.time = function (bucket, f) {                                      // 161
  return f();                                                                      // 162
};                                                                                 // 163
                                                                                   // 164
/////////////////////////////////////////////////////////////////////////////////////

}).call(this);
