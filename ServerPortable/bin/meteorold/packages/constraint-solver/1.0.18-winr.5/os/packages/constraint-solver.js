(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/datatypes.js                                                           //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
ConstraintSolver = {};                                                                               // 1
                                                                                                     // 2
var PV = PackageVersion;                                                                             // 3
var CS = ConstraintSolver;                                                                           // 4
                                                                                                     // 5
////////// PackageAndVersion                                                                         // 6
                                                                                                     // 7
// An ordered pair of (package, version).                                                            // 8
CS.PackageAndVersion = function (package, version) {                                                 // 9
  check(package, String);                                                                            // 10
  check(version, String);                                                                            // 11
                                                                                                     // 12
  this.package = package;                                                                            // 13
  this.version = version;                                                                            // 14
};                                                                                                   // 15
                                                                                                     // 16
// The string form of a PackageAndVersion is "package version",                                      // 17
// for example "foo 1.0.1".  The reason we don't use an "@" is                                       // 18
// it would look too much like a PackageConstraint.                                                  // 19
CS.PackageAndVersion.prototype.toString = function () {                                              // 20
  return this.package + " " + this.version;                                                          // 21
};                                                                                                   // 22
                                                                                                     // 23
CS.PackageAndVersion.fromString = function (str) {                                                   // 24
  var parts = str.split(' ');                                                                        // 25
  if (parts.length === 2 && parts[0] && parts[1]) {                                                  // 26
    return new CS.PackageAndVersion(parts[0], parts[1]);                                             // 27
  } else {                                                                                           // 28
    throw new Error("Malformed PackageAndVersion: " + str);                                          // 29
  }                                                                                                  // 30
};                                                                                                   // 31
                                                                                                     // 32
////////// Dependency                                                                                // 33
                                                                                                     // 34
// A Dependency consists of a PackageConstraint (like "foo@=1.2.3")                                  // 35
// and flags, like "isWeak".                                                                         // 36
                                                                                                     // 37
CS.Dependency = function (packageConstraint, flags) {                                                // 38
  check(packageConstraint, Match.OneOf(PV.PackageConstraint, String));                               // 39
  if (typeof packageConstraint === 'string') {                                                       // 40
    packageConstraint = PV.parsePackageConstraint(packageConstraint);                                // 41
  }                                                                                                  // 42
  if (flags) {                                                                                       // 43
    check(flags, Object);                                                                            // 44
  }                                                                                                  // 45
                                                                                                     // 46
  this.packageConstraint = packageConstraint;                                                        // 47
  this.isWeak = false;                                                                               // 48
                                                                                                     // 49
  if (flags) {                                                                                       // 50
    if (flags.isWeak) {                                                                              // 51
      this.isWeak = true;                                                                            // 52
    }                                                                                                // 53
  }                                                                                                  // 54
};                                                                                                   // 55
                                                                                                     // 56
// The string form of a Dependency is `?foo@1.0.0` for a weak                                        // 57
// reference to package "foo" with VersionConstraint "1.0.0".                                        // 58
CS.Dependency.prototype.toString = function () {                                                     // 59
  var ret = this.packageConstraint.toString();                                                       // 60
  if (this.isWeak) {                                                                                 // 61
    ret = '?' + ret;                                                                                 // 62
  }                                                                                                  // 63
  return ret;                                                                                        // 64
};                                                                                                   // 65
                                                                                                     // 66
CS.Dependency.fromString = function (str) {                                                          // 67
  var isWeak = false;                                                                                // 68
                                                                                                     // 69
  if (str.charAt(0) === '?') {                                                                       // 70
    isWeak = true;                                                                                   // 71
    str = str.slice(1);                                                                              // 72
  }                                                                                                  // 73
                                                                                                     // 74
  var flags = isWeak ? { isWeak: true } : null;                                                      // 75
                                                                                                     // 76
  return new CS.Dependency(str, flags);                                                              // 77
};                                                                                                   // 78
                                                                                                     // 79
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/catalog-cache.js                                                       //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var CS = ConstraintSolver;                                                                           // 1
                                                                                                     // 2
var pvkey = function (package, version) {                                                            // 3
  return package + " " + version;                                                                    // 4
};                                                                                                   // 5
                                                                                                     // 6
// Stores the Dependencies for each known PackageAndVersion.                                         // 7
CS.CatalogCache = function () {                                                                      // 8
  // String(PackageAndVersion) -> String -> Dependency.                                              // 9
  // For example, "foo 1.0.0" -> "bar" -> Dependency.fromString("?bar@1.0.2").                       // 10
  this._dependencies = {};                                                                           // 11
  // A map derived from the keys of _dependencies, for ease of iteration.                            // 12
  // "foo" -> ["1.0.0", ...]                                                                         // 13
  // Versions in the array are unique but not sorted.                                                // 14
  this._versions = {};                                                                               // 15
};                                                                                                   // 16
                                                                                                     // 17
CS.CatalogCache.prototype.hasPackageVersion = function (package, version) {                          // 18
  return _.has(this._dependencies, pvkey(package, version));                                         // 19
};                                                                                                   // 20
                                                                                                     // 21
CS.CatalogCache.prototype.addPackageVersion = function (p, v, deps) {                                // 22
  check(p, String);                                                                                  // 23
  check(v, String);                                                                                  // 24
  // `deps` must not have any duplicate values of `.packageConstraint.package`                       // 25
  check(deps, [CS.Dependency]);                                                                      // 26
                                                                                                     // 27
  var key = pvkey(p, v);                                                                             // 28
  if (_.has(this._dependencies, key)) {                                                              // 29
    throw new Error("Already have an entry for " + key);                                             // 30
  }                                                                                                  // 31
                                                                                                     // 32
  if (! _.has(this._versions, p)) {                                                                  // 33
    this._versions[p] = [];                                                                          // 34
  }                                                                                                  // 35
  this._versions[p].push(v);                                                                         // 36
                                                                                                     // 37
  var depsByPackage = {};                                                                            // 38
  this._dependencies[key] = depsByPackage;                                                           // 39
  _.each(deps, function (d) {                                                                        // 40
    var p2 = d.packageConstraint.package;                                                            // 41
    if (_.has(depsByPackage, p2)) {                                                                  // 42
      throw new Error("Can't have two dependencies on " + p2 +                                       // 43
                      " in " + key);                                                                 // 44
    }                                                                                                // 45
    depsByPackage[p2] = d;                                                                           // 46
  });                                                                                                // 47
};                                                                                                   // 48
                                                                                                     // 49
// Returns the dependencies of a (package, version), stored in a map.                                // 50
// The values are Dependency objects; the key for `d` is                                             // 51
// `d.packageConstraint.package`.  (Don't mutate the map.)                                           // 52
CS.CatalogCache.prototype.getDependencyMap = function (p, v) {                                       // 53
  var key = pvkey(p, v);                                                                             // 54
  if (! _.has(this._dependencies, key)) {                                                            // 55
    throw new Error("No entry for " + key);                                                          // 56
  }                                                                                                  // 57
  return this._dependencies[key];                                                                    // 58
};                                                                                                   // 59
                                                                                                     // 60
// Returns an array of version strings, unsorted, possibly empty.                                    // 61
// (Don't mutate the result.)                                                                        // 62
CS.CatalogCache.prototype.getPackageVersions = function (package) {                                  // 63
  return (_.has(this._versions, package) ?                                                           // 64
          this._versions[package] : []);                                                             // 65
};                                                                                                   // 66
                                                                                                     // 67
CS.CatalogCache.prototype.toJSONable = function () {                                                 // 68
  var self = this;                                                                                   // 69
  var data = {};                                                                                     // 70
  _.each(self._dependencies, function (depsByPackage, key) {                                         // 71
    // depsByPackage is a map of String -> Dependency.                                               // 72
    // Map over the values to get an array of String.                                                // 73
    data[key] = _.map(depsByPackage, function (dep) {                                                // 74
      return dep.toString();                                                                         // 75
    });                                                                                              // 76
  });                                                                                                // 77
  return { data: data };                                                                             // 78
};                                                                                                   // 79
                                                                                                     // 80
CS.CatalogCache.fromJSONable = function (obj) {                                                      // 81
  check(obj, { data: Object });                                                                      // 82
                                                                                                     // 83
  var cache = new CS.CatalogCache();                                                                 // 84
  _.each(obj.data, function (depsArray, pv) {                                                        // 85
    check(depsArray, [String]);                                                                      // 86
    pv = CS.PackageAndVersion.fromString(pv);                                                        // 87
    cache.addPackageVersion(                                                                         // 88
      pv.package, pv.version,                                                                        // 89
      _.map(depsArray, function (str) {                                                              // 90
        return CS.Dependency.fromString(str);                                                        // 91
      }));                                                                                           // 92
  });                                                                                                // 93
  return cache;                                                                                      // 94
};                                                                                                   // 95
                                                                                                     // 96
// Calls `iter` on each PackageAndVersion, with the second argument being                            // 97
// a map from package name to Dependency.  If `iter` returns true,                                   // 98
// iteration is stopped.                                                                             // 99
CS.CatalogCache.prototype.eachPackageVersion = function (iter) {                                     // 100
  var self = this;                                                                                   // 101
  _.find(self._dependencies, function (value, key) {                                                 // 102
    var stop = iter(CS.PackageAndVersion.fromString(key), value);                                    // 103
    return stop;                                                                                     // 104
  });                                                                                                // 105
};                                                                                                   // 106
                                                                                                     // 107
// Calls `iter` on each package name, with the second argument being                                 // 108
// a list of versions present for that package (unique but not sorted).                              // 109
// If `iter` returns true, iteration is stopped.                                                     // 110
ConstraintSolver.CatalogCache.prototype.eachPackage = function (iter) {                              // 111
  var self = this;                                                                                   // 112
  _.find(_.keys(self._versions), function (key) {                                                    // 113
    var stop = iter(key, self.getPackageVersions(key));                                              // 114
    return stop;                                                                                     // 115
  });                                                                                                // 116
};                                                                                                   // 117
                                                                                                     // 118
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/catalog-loader.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;                                                                             // 1
var CS = ConstraintSolver;                                                                           // 2
                                                                                                     // 3
// A CatalogLoader populates the CatalogCache from the Catalog.  When                                // 4
// running unit tests with no Catalog and canned data for the                                        // 5
// CatalogCache, there will be no CatalogLoader.                                                     // 6
//                                                                                                   // 7
// Fine-grained Loading: While we don't currently support loading only                               // 8
// some versions of a package, CatalogLoader is meant to be extended                                 // 9
// to support incrementally loading individual package versions.  It                                 // 10
// has no concept of a "loaded package," for example, just a loaded                                  // 11
// package version.  CatalogLoader's job, in principle, is to load                                   // 12
// package versions efficiently, no matter the access pattern, by                                    // 13
// making the right catalog calls and doing the right caching.                                       // 14
// Calling a catalog method generally means running a SQLite query,                                  // 15
// which could be time-consuming.                                                                    // 16
                                                                                                     // 17
CS.CatalogLoader = function (fromCatalog, toCatalogCache) {                                          // 18
  var self = this;                                                                                   // 19
                                                                                                     // 20
  self.catalog = fromCatalog;                                                                        // 21
  self.catalogCache = toCatalogCache;                                                                // 22
                                                                                                     // 23
  self._sortedVersionRecordsCache = {};                                                              // 24
};                                                                                                   // 25
                                                                                                     // 26
// We rely on the following `catalog` methods:                                                       // 27
//                                                                                                   // 28
// * getSortedVersionRecords(packageName) ->                                                         // 29
//     [{packageName, version, dependencies}]                                                        // 30
//                                                                                                   // 31
//   Where `dependencies` is a map from packageName to                                               // 32
//   an object of the form `{ constraint: String|null,                                               // 33
//   references: [{arch: String, optional "weak": true}] }`.                                         // 34
                                                                                                     // 35
var convertDeps = function (catalogDeps) {                                                           // 36
  return _.map(catalogDeps, function (dep, package) {                                                // 37
    // The dependency is strong if any of its "references"                                           // 38
    // (for different architectures) are strong.                                                     // 39
    var isStrong = _.any(dep.references, function (ref) {                                            // 40
      return !ref.weak;                                                                              // 41
    });                                                                                              // 42
                                                                                                     // 43
    var constraint = (dep.constraint || null);                                                       // 44
                                                                                                     // 45
    return new CS.Dependency(new PV.PackageConstraint(package, constraint),                          // 46
                             isStrong ? null : {isWeak: true});                                      // 47
  });                                                                                                // 48
};                                                                                                   // 49
                                                                                                     // 50
// Since we don't fetch different versions of a package independently                                // 51
// at the moment, this helper is where we get our data.                                              // 52
CS.CatalogLoader.prototype._getSortedVersionRecords = function (package) {                           // 53
  if (! _.has(this._sortedVersionRecordsCache, package)) {                                           // 54
    this._sortedVersionRecordsCache[package] =                                                       // 55
      this.catalog.getSortedVersionRecords(package);                                                 // 56
  }                                                                                                  // 57
                                                                                                     // 58
  return this._sortedVersionRecordsCache[package];                                                   // 59
};                                                                                                   // 60
                                                                                                     // 61
CS.CatalogLoader.prototype.loadAllVersions = function (package) {                                    // 62
  var self = this;                                                                                   // 63
  var cache = self.catalogCache;                                                                     // 64
  var versionRecs = self._getSortedVersionRecords(package);                                          // 65
  _.each(versionRecs, function (rec) {                                                               // 66
    var version = rec.version;                                                                       // 67
    if (! cache.hasPackageVersion(package, version)) {                                               // 68
      var deps = convertDeps(rec.dependencies);                                                      // 69
      cache.addPackageVersion(package, version, deps);                                               // 70
    }                                                                                                // 71
  });                                                                                                // 72
};                                                                                                   // 73
                                                                                                     // 74
// Takes an array of package names.  Loads all versions of them and their                            // 75
// (strong) dependencies.                                                                            // 76
CS.CatalogLoader.prototype.loadAllVersionsRecursive = function (packageList) {                       // 77
  var self = this;                                                                                   // 78
                                                                                                     // 79
  // Within a call to loadAllVersionsRecursive, we only visit each package                           // 80
  // at most once.  If we visit a package we've already loaded, it will                              // 81
  // lead to a quick scan through the versions in our cache to make sure                             // 82
  // they have been loaded into the CatalogCache.                                                    // 83
  var loadQueue = [];                                                                                // 84
  var packagesEverEnqueued = {};                                                                     // 85
                                                                                                     // 86
  var enqueue = function (package) {                                                                 // 87
    if (! _.has(packagesEverEnqueued, package)) {                                                    // 88
      packagesEverEnqueued[package] = true;                                                          // 89
      loadQueue.push(package);                                                                       // 90
    }                                                                                                // 91
  };                                                                                                 // 92
                                                                                                     // 93
  _.each(packageList, enqueue);                                                                      // 94
                                                                                                     // 95
  while (loadQueue.length) {                                                                         // 96
    var package = loadQueue.pop();                                                                   // 97
    self.loadAllVersions(package);                                                                   // 98
    _.each(self.catalogCache.getPackageVersions(package), function (v) {                             // 99
      var depMap = self.catalogCache.getDependencyMap(package, v);                                   // 100
      _.each(depMap, function (dep, package2) {                                                      // 101
        enqueue(package2);                                                                           // 102
      });                                                                                            // 103
    });                                                                                              // 104
  }                                                                                                  // 105
};                                                                                                   // 106
                                                                                                     // 107
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraint-solver-input.js                                             //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;                                                                             // 1
var CS = ConstraintSolver;                                                                           // 2
                                                                                                     // 3
// The "Input" object completely specifies the input to the resolver,                                // 4
// and it holds the data loaded from the Catalog as well.  It can be                                 // 5
// serialized to JSON and read back in for testing purposes.                                         // 6
CS.Input = function (dependencies, constraints, catalogCache, options) {                             // 7
  options = options || {};                                                                           // 8
                                                                                                     // 9
  this.dependencies = dependencies;                                                                  // 10
  this.constraints = constraints;                                                                    // 11
  this.upgrade = options.upgrade || [];                                                              // 12
  this.anticipatedPrereleases = options.anticipatedPrereleases || {};                                // 13
  this.previousSolution = options.previousSolution || null;                                          // 14
                                                                                                     // 15
  check(this.dependencies, [String]);                                                                // 16
  check(this.constraints, [PackageConstraintType]);                                                  // 17
  check(this.upgrade, [String]);                                                                     // 18
  check(this.anticipatedPrereleases,                                                                 // 19
        Match.ObjectWithValues(Match.ObjectWithValues(Boolean)));                                    // 20
  check(this.previousSolution, Match.OneOf(Object, null));                                           // 21
                                                                                                     // 22
  this.catalogCache = catalogCache;                                                                  // 23
};                                                                                                   // 24
                                                                                                     // 25
CS.Input.prototype.loadFromCatalog = function (catalogLoader) {                                      // 26
  var self = this;                                                                                   // 27
                                                                                                     // 28
  var packagesToLoad = {}; // package -> true                                                        // 29
                                                                                                     // 30
  _.each(self.dependencies, function (package) {                                                     // 31
    packagesToLoad[package] = true;                                                                  // 32
  });                                                                                                // 33
  _.each(self.constraints, function (constraint) {                                                   // 34
    packagesToLoad[constraint.package] = true;                                                       // 35
  });                                                                                                // 36
  _.each(self.previousSolution, function (version, package) {                                        // 37
    packagesToLoad[package] = true;                                                                  // 38
  });                                                                                                // 39
                                                                                                     // 40
  // Load packages into the cache (if they aren't loaded already).                                   // 41
  catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));                                    // 42
};                                                                                                   // 43
                                                                                                     // 44
CS.Input.prototype.toJSONable = function () {                                                        // 45
  var self = this;                                                                                   // 46
  var obj = {                                                                                        // 47
    dependencies: self.dependencies,                                                                 // 48
    constraints: _.map(self.constraints, function (c) {                                              // 49
      return c.toString();                                                                           // 50
    }),                                                                                              // 51
    catalogCache: self.catalogCache.toJSONable()                                                     // 52
  };                                                                                                 // 53
  // For readability of the resulting JSON, only include optional                                    // 54
  // properties that aren't the default.                                                             // 55
  if (self.upgrade.length) {                                                                         // 56
    obj.upgrade = self.upgrade;                                                                      // 57
  }                                                                                                  // 58
  if (! _.isEmpty(self.anticipatedPrereleases)) {                                                    // 59
    obj.anticipatedPrereleases = self.anticipatedPrereleases;                                        // 60
  }                                                                                                  // 61
  if (self.previousSolution !== null) {                                                              // 62
    obj.previousSolution = self.previousSolution;                                                    // 63
  };                                                                                                 // 64
  return obj;                                                                                        // 65
};                                                                                                   // 66
                                                                                                     // 67
CS.Input.fromJSONable = function (obj) {                                                             // 68
  check(obj, {                                                                                       // 69
    dependencies: [String],                                                                          // 70
    constraints: [String],                                                                           // 71
    catalogCache: Object,                                                                            // 72
    anticipatedPrereleases: Match.Optional(                                                          // 73
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean))),                                      // 74
    previousSolution: Match.Optional(Match.OneOf(Object, null)),                                     // 75
    upgrade: Match.Optional([String])                                                                // 76
  });                                                                                                // 77
                                                                                                     // 78
  return new CS.Input(                                                                               // 79
    obj.dependencies,                                                                                // 80
    _.map(obj.constraints, function (cstr) {                                                         // 81
      return PV.parsePackageConstraint(cstr);                                                        // 82
    }),                                                                                              // 83
    CS.CatalogCache.fromJSONable(obj.catalogCache),                                                  // 84
    {                                                                                                // 85
      upgrade: obj.upgrade,                                                                          // 86
      anticipatedPrereleases: obj.anticipatedPrereleases,                                            // 87
      previousSolution: obj.previousSolution                                                         // 88
    });                                                                                              // 89
};                                                                                                   // 90
                                                                                                     // 91
// PackageConstraints and VersionConstraints passed in from the tool                                 // 92
// to us (where we are a uniloaded package) will have constructors                                   // 93
// that we don't recognize because they come from a different copy of                                // 94
// package-version-parser!  In addition, objects with constructors                                   // 95
// can't be checked by "check" in the same way as plain objects, so we                               // 96
// have to resort to examining the fields explicitly.                                                // 97
var VersionConstraintType = Match.OneOf(                                                             // 98
  PV.VersionConstraint,                                                                              // 99
  Match.Where(function (vc) {                                                                        // 100
    check(vc.raw, String);                                                                           // 101
    check(vc.alternatives, [{                                                                        // 102
      versionString: Match.OneOf(String, null),                                                      // 103
      type: String                                                                                   // 104
    }]);                                                                                             // 105
    return vc.constructor !== Object;                                                                // 106
  }));                                                                                               // 107
                                                                                                     // 108
var PackageConstraintType = Match.OneOf(                                                             // 109
  PV.PackageConstraint,                                                                              // 110
  Match.Where(function (c) {                                                                         // 111
    check(c.package, String);                                                                        // 112
    check(c.constraintString, String);                                                               // 113
    check(c.versionConstraint, VersionConstraintType);                                               // 114
    return c.constructor !== Object;                                                                 // 115
  }));                                                                                               // 116
                                                                                                     // 117
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraint-solver.js                                                   //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;                                                                             // 1
var CS = ConstraintSolver;                                                                           // 2
                                                                                                     // 3
// This is the entry point for the constraint-solver package.  The tool                              // 4
// creates a ConstraintSolver.PackagesResolver and calls .resolve on it.                             // 5
                                                                                                     // 6
CS.PackagesResolver = function (catalog, options) {                                                  // 7
  var self = this;                                                                                   // 8
                                                                                                     // 9
  self.catalog = catalog;                                                                            // 10
  self.catalogCache = new CS.CatalogCache();                                                         // 11
  self.catalogLoader = new CS.CatalogLoader(self.catalog, self.catalogCache);                        // 12
                                                                                                     // 13
  self._options = {                                                                                  // 14
    nudge: options && options.nudge                                                                  // 15
  };                                                                                                 // 16
};                                                                                                   // 17
                                                                                                     // 18
// dependencies - an array of string names of packages (not slices)                                  // 19
// constraints - an array of PV.PackageConstraints                                                   // 20
// options:                                                                                          // 21
//  - upgrade - list of dependencies for which upgrade is prioritized higher                         // 22
//    than keeping the old version                                                                   // 23
//  - previousSolution - mapping from package name to a version that was used in                     // 24
//    the previous constraint solver run                                                             // 25
//  - anticipatedPrereleases: mapping from package name to version to true;                          // 26
//    included versions are the only pre-releases that are allowed to match                          // 27
//    constraints that don't specifically name them during the "try not to                           // 28
//    use unanticipated pre-releases" pass                                                           // 29
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,                         // 30
                                                  options) {                                         // 31
  var self = this;                                                                                   // 32
  var input = new CS.Input(dependencies, constraints, self.catalogCache,                             // 33
                           options);                                                                 // 34
  input.loadFromCatalog(self.catalogLoader);                                                         // 35
                                                                                                     // 36
  return CS.PackagesResolver._resolveWithInput(input, this._options.nudge);                          // 37
};                                                                                                   // 38
                                                                                                     // 39
// Exposed for tests.                                                                                // 40
CS.PackagesResolver._resolveWithInput = function (input, _nudge) {                                   // 41
  check(input, CS.Input);                                                                            // 42
                                                                                                     // 43
  // Dump the input to the console!  XXX Put this behind a flag.                                     // 44
  //console.log(JSON.stringify(input.toJSONable(), null, 2));                                        // 45
                                                                                                     // 46
  var resolver = new CS.Resolver({nudge: _nudge});                                                   // 47
                                                                                                     // 48
  // Set up the Resolver using the package versions in the cache.                                    // 49
  var cache = input.catalogCache;                                                                    // 50
  cache.eachPackage(function (p, versions) {                                                         // 51
    versions = _.clone(versions).sort(PV.compare);                                                   // 52
    _.each(versions, function (v) {                                                                  // 53
      var uv = new CS.UnitVersion(p, v);                                                             // 54
      resolver.addUnitVersion(uv);                                                                   // 55
      _.each(cache.getDependencyMap(p, v), function (dep) {                                          // 56
        // `dep` is a CS.Dependency                                                                  // 57
        var p2 = dep.packageConstraint.package;                                                      // 58
        var constr = dep.packageConstraint.constraintString;                                         // 59
        if (! dep.isWeak) {                                                                          // 60
          uv.addDependency(p2);                                                                      // 61
        }                                                                                            // 62
        if (constr) {                                                                                // 63
          uv.addConstraint(resolver.getConstraint(p2, constr));                                      // 64
        }                                                                                            // 65
      });                                                                                            // 66
    });                                                                                              // 67
  });                                                                                                // 68
                                                                                                     // 69
  var previousSolutionUVs = null;                                                                    // 70
  if (input.previousSolution) {                                                                      // 71
    // Build a list of the UnitVersions that we know about that were                                 // 72
    // mentioned in the previousSolution map.                                                        // 73
    // (_.compact drops unknown UnitVersions.)                                                       // 74
    previousSolutionUVs = _.compact(                                                                 // 75
      _.map(input.previousSolution, function (version, packageName) {                                // 76
        return resolver.getUnitVersion(packageName, version);                                        // 77
      }));                                                                                           // 78
  }                                                                                                  // 79
                                                                                                     // 80
  // Convert upgrade to a map for O(1) access.                                                       // 81
  var upgradePackages = {};                                                                          // 82
  _.each(input.upgrade, function (packageName) {                                                     // 83
    upgradePackages[packageName] = true;                                                             // 84
  });                                                                                                // 85
                                                                                                     // 86
  var constraints = _.map(input.constraints, function (c) {                                          // 87
    return resolver.getConstraint(c.package, c.constraintString);                                    // 88
  });                                                                                                // 89
                                                                                                     // 90
  var resolverOptions = {                                                                            // 91
    anticipatedPrereleases: input.anticipatedPrereleases                                             // 92
  };                                                                                                 // 93
  _.extend(resolverOptions,                                                                          // 94
           getCostFunction(resolver, {                                                               // 95
             rootDependencies: input.dependencies,                                                   // 96
             upgrade: upgradePackages,                                                               // 97
             previousSolution: previousSolutionUVs                                                   // 98
           }));                                                                                      // 99
                                                                                                     // 100
  var res = null;                                                                                    // 101
  var neededToUseUnanticipatedPrereleases = false;                                                   // 102
                                                                                                     // 103
  // If a previous solution existed, try resolving with additional (weak)                            // 104
  // equality constraints on all the versions from the previous solution (except                     // 105
  // those we've explicitly been asked to update). If it's possible to solve the                     // 106
  // constraints without changing any of the previous versions (though we may                        // 107
  // add more choices in addition, or remove some now-unnecessary choices) then                      // 108
  // that's our first try.                                                                           // 109
  //                                                                                                 // 110
  // If we're intentionally trying to upgrade some or all packages, we just skip                     // 111
  // this step. We used to try to do this step but just leaving off pins from                        // 112
  // the packages we're trying to upgrade, but this tended to not lead to actual                     // 113
  // upgrades since we were still pinning things that the to-upgrade package                         // 114
  // depended on.  (We still use the specific contents of options.upgrade to                         // 115
  // guide which things are encouraged to be upgraded vs stay the same in the                        // 116
  // heuristic.)                                                                                     // 117
  if (!_.isEmpty(previousSolutionUVs) && _.isEmpty(upgradePackages)) {                               // 118
    var constraintsWithPreviousSolutionLock = _.clone(constraints);                                  // 119
    _.each(previousSolutionUVs, function (uv) {                                                      // 120
      constraintsWithPreviousSolutionLock.push(                                                      // 121
        resolver.getConstraint(uv.name, '=' + uv.version));                                          // 122
    });                                                                                              // 123
    try {                                                                                            // 124
      // Try running the resolver. If it fails to resolve, that's OK, we'll keep                     // 125
      // working.                                                                                    // 126
      res = resolver.resolve(                                                                        // 127
        input.dependencies,                                                                          // 128
        constraintsWithPreviousSolutionLock, resolverOptions);                                       // 129
    } catch (e) {                                                                                    // 130
      if (!(e.constraintSolverError))                                                                // 131
        throw e;                                                                                     // 132
    }                                                                                                // 133
  }                                                                                                  // 134
                                                                                                     // 135
  // Either we didn't have a previous solution, or it doesn't work. Try again                        // 136
  // without locking in the previous solution as strict equality.                                    // 137
  if (!res) {                                                                                        // 138
    try {                                                                                            // 139
      res = resolver.resolve(input.dependencies, constraints, resolverOptions);                      // 140
    } catch (e) {                                                                                    // 141
      if (!(e.constraintSolverError))                                                                // 142
        throw e;                                                                                     // 143
    }                                                                                                // 144
  }                                                                                                  // 145
                                                                                                     // 146
  // As a last-ditch effort, let's allow ANY pre-release version found in the                        // 147
  // catalog, not only those that are asked for at some level.                                       // 148
  if (!res) {                                                                                        // 149
    resolverOptions.anticipatedPrereleases = true;                                                   // 150
    neededToUseUnanticipatedPrereleases = true;                                                      // 151
    // Unlike the previous calls, this one throws a constraintSolverError on                         // 152
    // failure.                                                                                      // 153
    res = resolver.resolve(input.dependencies, constraints, resolverOptions);                        // 154
  }                                                                                                  // 155
  return {                                                                                           // 156
    answer:  resolverResultToPackageMap(res),                                                        // 157
    neededToUseUnanticipatedPrereleases: neededToUseUnanticipatedPrereleases                         // 158
  };                                                                                                 // 159
};                                                                                                   // 160
                                                                                                     // 161
var resolverResultToPackageMap = function (choices) {                                                // 162
  var packageMap = {};                                                                               // 163
  mori.each(choices, function (nameAndUv) {                                                          // 164
    var name = mori.first(nameAndUv);                                                                // 165
    var uv = mori.last(nameAndUv);                                                                   // 166
    packageMap[name] = uv.version;                                                                   // 167
  });                                                                                                // 168
  return packageMap;                                                                                 // 169
};                                                                                                   // 170
                                                                                                     // 171
// Takes options {rootDependencies, previousSolution, upgrade}.                                      // 172
//                                                                                                   // 173
// Returns an object containing {costFunction, estimateCostFunction,                                 // 174
// combineCostFunction}.                                                                             // 175
var getCostFunction = function (resolver, options) {                                                 // 176
  // Poorman's enum                                                                                  // 177
  var VMAJOR = 0, MAJOR = 1, MEDIUM = 2, MINOR = 3;                                                  // 178
  var rootDeps = options.rootDependencies || [];                                                     // 179
  var prevSol = options.previousSolution || [];                                                      // 180
                                                                                                     // 181
  var isRootDep = {};                                                                                // 182
  var prevSolMapping = {};                                                                           // 183
                                                                                                     // 184
  _.each(rootDeps, function (dep) { isRootDep[dep] = true; });                                       // 185
                                                                                                     // 186
  // if the upgrade is preferred over preserving previous solution, pretend                          // 187
  // there are no previous solution                                                                  // 188
  _.each(prevSol, function (uv) {                                                                    // 189
    if (! _.has(options.upgrade, uv.name))                                                           // 190
      prevSolMapping[uv.name] = uv;                                                                  // 191
  });                                                                                                // 192
                                                                                                     // 193
  return {                                                                                           // 194
    costFunction: function (state) {                                                                 // 195
      options = options || {};                                                                       // 196
      // very major, major, medium, minor costs                                                      // 197
      // XXX maybe these can be calculated lazily?                                                   // 198
      var cost = [0, 0, 0, 0];                                                                       // 199
                                                                                                     // 200
      mori.each(state.choices, function (nameAndUv) {                                                // 201
        var uv = mori.last(nameAndUv);                                                               // 202
        if (_.has(prevSolMapping, uv.name)) {                                                        // 203
          // The package was present in the previous solution                                        // 204
          var prev = prevSolMapping[uv.name];                                                        // 205
          var versionsDistance =                                                                     // 206
            PV.versionMagnitude(uv.version) -                                                        // 207
            PV.versionMagnitude(prev.version);                                                       // 208
                                                                                                     // 209
          var isCompatible = prev.majorVersion === uv.majorVersion;                                  // 210
                                                                                                     // 211
          if (isRootDep[uv.name]) {                                                                  // 212
            // root dependency                                                                       // 213
            if (versionsDistance < 0 || ! isCompatible) {                                            // 214
              // the new pick is older or is incompatible with the prev. solution                    // 215
              // i.e. can have breaking changes, prefer not to do this                               // 216
              // XXX in fact we want to avoid downgrades to the direct                               // 217
              // dependencies at all cost.                                                           // 218
              cost[VMAJOR]++;                                                                        // 219
            } else {                                                                                 // 220
              // compatible but possibly newer                                                       // 221
              // prefer the version closest to the older solution                                    // 222
              cost[MAJOR] += versionsDistance;                                                       // 223
            }                                                                                        // 224
          } else {                                                                                   // 225
            // transitive dependency                                                                 // 226
            // prefer to have less changed transitive dependencies                                   // 227
            cost[MINOR] += versionsDistance === 0 ? 0 : 1;                                           // 228
          }                                                                                          // 229
        } else {                                                                                     // 230
          var latestDistance =                                                                       // 231
            PV.versionMagnitude(_.last(resolver.unitsVersions[uv.name]).version) -                   // 232
            PV.versionMagnitude(uv.version);                                                         // 233
                                                                                                     // 234
          if (isRootDep[uv.name] || _.has(options.upgrade, uv.name)) {                               // 235
            // preferably latest                                                                     // 236
            cost[MEDIUM] += latestDistance;                                                          // 237
          } else {                                                                                   // 238
            // transitive dependency                                                                 // 239
            // prefarable earliest possible to be conservative                                       // 240
            // How far is our choice from the most conservative version that                         // 241
            // also matches our constraints?                                                         // 242
            var minimal = state.constraints.getMinimalVersion(uv.name) || '0.0.0';                   // 243
            cost[MINOR] += PV.versionMagnitude(uv.version) - PV.versionMagnitude(minimal);           // 244
          }                                                                                          // 245
        }                                                                                            // 246
      });                                                                                            // 247
                                                                                                     // 248
      return cost;                                                                                   // 249
    },                                                                                               // 250
                                                                                                     // 251
    estimateCostFunction: function (state) {                                                         // 252
      options = options || {};                                                                       // 253
                                                                                                     // 254
      var cost = [0, 0, 0, 0];                                                                       // 255
                                                                                                     // 256
      state.eachDependency(function (dep, alternatives) {                                            // 257
        // XXX don't try to estimate transitive dependencies                                         // 258
        if (! isRootDep[dep]) {                                                                      // 259
          cost[MINOR] += 10000000;                                                                   // 260
          return;                                                                                    // 261
        }                                                                                            // 262
                                                                                                     // 263
        if (_.has(prevSolMapping, dep)) {                                                            // 264
          var prev = prevSolMapping[dep];                                                            // 265
          var prevVersionMatches = state.isSatisfied(prev);                                          // 266
                                                                                                     // 267
          // if it matches, assume we would pick it and the cost doesn't                             // 268
          // increase                                                                                // 269
          if (prevVersionMatches)                                                                    // 270
            return;                                                                                  // 271
                                                                                                     // 272
          // Get earliest matching version.                                                          // 273
          var earliestMatching = mori.first(alternatives);                                           // 274
                                                                                                     // 275
          var isCompatible =                                                                         // 276
                prev.majorVersion === earliestMatching.majorVersion;                                 // 277
          if (! isCompatible) {                                                                      // 278
            cost[VMAJOR]++;                                                                          // 279
            return;                                                                                  // 280
          }                                                                                          // 281
                                                                                                     // 282
          var versionsDistance =                                                                     // 283
            PV.versionMagnitude(earliestMatching.version) -                                          // 284
            PV.versionMagnitude(prev.version);                                                       // 285
          if (versionsDistance < 0) {                                                                // 286
            cost[VMAJOR]++;                                                                          // 287
            return;                                                                                  // 288
          }                                                                                          // 289
                                                                                                     // 290
          cost[MAJOR] += versionsDistance;                                                           // 291
        } else {                                                                                     // 292
          var versions = resolver.unitsVersions[dep];                                                // 293
          var latestMatching = mori.last(alternatives);                                              // 294
                                                                                                     // 295
          var latestDistance =                                                                       // 296
            PV.versionMagnitude(                                                                     // 297
              _.last(resolver.unitsVersions[dep]).version) -                                         // 298
            PV.versionMagnitude(latestMatching.version);                                             // 299
                                                                                                     // 300
          cost[MEDIUM] += latestDistance;                                                            // 301
        }                                                                                            // 302
      });                                                                                            // 303
                                                                                                     // 304
      return cost;                                                                                   // 305
    },                                                                                               // 306
                                                                                                     // 307
    combineCostFunction: function (costA, costB) {                                                   // 308
      if (costA.length !== costB.length)                                                             // 309
        throw new Error("Different cost types");                                                     // 310
                                                                                                     // 311
      var arr = [];                                                                                  // 312
      _.each(costA, function (l, i) {                                                                // 313
        arr.push(l + costB[i]);                                                                      // 314
      });                                                                                            // 315
                                                                                                     // 316
      return arr;                                                                                    // 317
    }                                                                                                // 318
  };                                                                                                 // 319
};                                                                                                   // 320
                                                                                                     // 321
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/resolver.js                                                            //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
mori = Npm.require('mori');                                                                          // 1
                                                                                                     // 2
BREAK = {};  // used by our 'each' functions                                                         // 3
                                                                                                     // 4
////////////////////////////////////////////////////////////////////////////////                     // 5
// Resolver                                                                                          // 6
////////////////////////////////////////////////////////////////////////////////                     // 7
                                                                                                     // 8
// XXX the whole resolver heavily relies on these statements to be true:                             // 9
// - every unit version ever used was added to the resolver with addUnitVersion                      // 10
// - every constraint ever used was instantiated with getConstraint                                  // 11
// - every constraint was added exactly once                                                         // 12
// - every unit version was added exactly once                                                       // 13
// - if two unit versions are the same, their refs point at the same object                          // 14
// - if two constraints are the same, their refs point at the same object                            // 15
ConstraintSolver.Resolver = function (options) {                                                     // 16
  var self = this;                                                                                   // 17
  options = options || {};                                                                           // 18
                                                                                                     // 19
  self._nudge = options.nudge;                                                                       // 20
                                                                                                     // 21
  // Maps unit name string to a sorted array of version definitions                                  // 22
  self.unitsVersions = {};                                                                           // 23
  // Maps name@version string to a unit version                                                      // 24
  self._unitsVersionsMap = {};                                                                       // 25
                                                                                                     // 26
  // Refs to all constraints. Mapping String -> instance                                             // 27
  self._constraints = {};                                                                            // 28
};                                                                                                   // 29
                                                                                                     // 30
ConstraintSolver.Resolver.prototype.addUnitVersion = function (unitVersion) {                        // 31
  var self = this;                                                                                   // 32
                                                                                                     // 33
  check(unitVersion, ConstraintSolver.UnitVersion);                                                  // 34
                                                                                                     // 35
  if (_.has(self._unitsVersionsMap, unitVersion.toString())) {                                       // 36
    throw Error("duplicate uv " + unitVersion.toString() + "?");                                     // 37
  }                                                                                                  // 38
                                                                                                     // 39
  if (! _.has(self.unitsVersions, unitVersion.name)) {                                               // 40
    self.unitsVersions[unitVersion.name] = [];                                                       // 41
  } else {                                                                                           // 42
    var latest = _.last(self.unitsVersions[unitVersion.name]).version;                               // 43
    if (!PackageVersion.lessThan(latest, unitVersion.version)) {                                     // 44
      throw Error("adding uv out of order: " + latest + " vs "                                       // 45
                  + unitVersion.version);                                                            // 46
    }                                                                                                // 47
  }                                                                                                  // 48
                                                                                                     // 49
  self.unitsVersions[unitVersion.name].push(unitVersion);                                            // 50
  self._unitsVersionsMap[unitVersion.toString()] = unitVersion;                                      // 51
};                                                                                                   // 52
                                                                                                     // 53
                                                                                                     // 54
                                                                                                     // 55
ConstraintSolver.Resolver.prototype.getUnitVersion = function (unitName, version) {                  // 56
  var self = this;                                                                                   // 57
  return self._unitsVersionsMap[unitName + "@" + version];                                           // 58
};                                                                                                   // 59
                                                                                                     // 60
// name - String - "someUnit"                                                                        // 61
// versionConstraint - String - "=1.2.3" or "2.1.0"                                                  // 62
ConstraintSolver.Resolver.prototype.getConstraint =                                                  // 63
  function (name, versionConstraint) {                                                               // 64
  var self = this;                                                                                   // 65
                                                                                                     // 66
  check(name, String);                                                                               // 67
  check(versionConstraint, String);                                                                  // 68
                                                                                                     // 69
  var idString = JSON.stringify([name, versionConstraint]);                                          // 70
                                                                                                     // 71
  if (_.has(self._constraints, idString))                                                            // 72
    return self._constraints[idString];                                                              // 73
                                                                                                     // 74
  return self._constraints[idString] =                                                               // 75
    new ConstraintSolver.Constraint(name, versionConstraint);                                        // 76
};                                                                                                   // 77
                                                                                                     // 78
// options: Object:                                                                                  // 79
// - costFunction: function (state) - given a state evaluates its cost                               // 80
// - estimateCostFunction: function (state) - given a state, evaluates the                           // 81
// estimated cost of the best path from state to a final state                                       // 82
// - combineCostFunction: function (cost, cost) - given two costs (obtained by                       // 83
// evaluating states with costFunction and estimateCostFunction)                                     // 84
ConstraintSolver.Resolver.prototype.resolve = function (                                             // 85
    dependencies, constraints, options) {                                                            // 86
  var self = this;                                                                                   // 87
  constraints = constraints || [];                                                                   // 88
  var choices = mori.hash_map();  // uv.name -> uv                                                   // 89
  options = _.extend({                                                                               // 90
    costFunction: function (state) { return 0; },                                                    // 91
    estimateCostFunction: function (state) {                                                         // 92
      return 0;                                                                                      // 93
    },                                                                                               // 94
    combineCostFunction: function (cost, anotherCost) {                                              // 95
      return cost + anotherCost;                                                                     // 96
    },                                                                                               // 97
    anticipatedPrereleases: {}                                                                       // 98
  }, options);                                                                                       // 99
                                                                                                     // 100
  var resolveContext = new ResolveContext(options.anticipatedPrereleases);                           // 101
                                                                                                     // 102
  // Mapping that assigns every package an integer priority. We compute this                         // 103
  // dynamically and in the process of resolution we try to resolve packages                         // 104
  // with higher priority first. This helps the resolver a lot because if some                       // 105
  // package has a higher weight to the solution (like a direct dependency) or                       // 106
  // is more likely to break our solution in the future than others, it would be                     // 107
  // great to try out and evaluate all versions early in the decision tree.                          // 108
  // XXX this could go on ResolveContext                                                             // 109
  var resolutionPriority = {};                                                                       // 110
                                                                                                     // 111
  var startState = new ResolverState(self, resolveContext);                                          // 112
                                                                                                     // 113
  _.each(constraints, function (constraint) {                                                        // 114
    startState = startState.addConstraint(constraint, mori.list());                                  // 115
  });                                                                                                // 116
                                                                                                     // 117
  _.each(dependencies, function (unitName) {                                                         // 118
    startState = startState.addDependency(unitName, mori.list());                                    // 119
    // Direct dependencies start on higher priority                                                  // 120
    resolutionPriority[unitName] = 100;                                                              // 121
  });                                                                                                // 122
                                                                                                     // 123
  if (startState.success()) {                                                                        // 124
    return startState.choices;                                                                       // 125
  }                                                                                                  // 126
                                                                                                     // 127
  if (startState.error) {                                                                            // 128
    throwConstraintSolverError(startState.error);                                                    // 129
  }                                                                                                  // 130
                                                                                                     // 131
  var pq = new PriorityQueue();                                                                      // 132
  var overallCostFunction = function (state) {                                                       // 133
    return [                                                                                         // 134
      options.combineCostFunction(                                                                   // 135
        options.costFunction(state),                                                                 // 136
        options.estimateCostFunction(state)),                                                        // 137
      -mori.count(state.choices)                                                                     // 138
    ];                                                                                               // 139
  };                                                                                                 // 140
                                                                                                     // 141
  pq.push(startState, overallCostFunction(startState));                                              // 142
                                                                                                     // 143
  var someError = null;                                                                              // 144
  var anySucceeded = false;                                                                          // 145
  while (! pq.empty()) {                                                                             // 146
    // Since we're in a CPU-bound loop, allow yielding or printing a message or                      // 147
    // something.                                                                                    // 148
    self._nudge && self._nudge();                                                                    // 149
                                                                                                     // 150
    var currentState = pq.pop();                                                                     // 151
                                                                                                     // 152
    if (currentState.success()) {                                                                    // 153
      return currentState.choices;                                                                   // 154
    }                                                                                                // 155
                                                                                                     // 156
    var neighborsObj = self._stateNeighbors(currentState, resolutionPriority);                       // 157
                                                                                                     // 158
    if (! neighborsObj.success) {                                                                    // 159
      someError = someError || neighborsObj.failureMsg;                                              // 160
      resolutionPriority[neighborsObj.conflictingUnit] =                                             // 161
        (resolutionPriority[neighborsObj.conflictingUnit] || 0) + 1;                                 // 162
    } else {                                                                                         // 163
      _.each(neighborsObj.neighbors, function (state) {                                              // 164
        // We don't just return the first successful one we find, in case there                      // 165
        // are multiple successful states (we want to sort by cost function in                       // 166
        // that case).                                                                               // 167
        pq.push(state, overallCostFunction(state));                                                  // 168
      });                                                                                            // 169
    }                                                                                                // 170
  }                                                                                                  // 171
                                                                                                     // 172
  // XXX should be much much better                                                                  // 173
  if (someError) {                                                                                   // 174
    throwConstraintSolverError(someError);                                                           // 175
  }                                                                                                  // 176
                                                                                                     // 177
  throw new Error("ran out of states without error?");                                               // 178
};                                                                                                   // 179
                                                                                                     // 180
var throwConstraintSolverError = function (message) {                                                // 181
  var e = new Error(message);                                                                        // 182
  e.constraintSolverError = true;                                                                    // 183
  throw e;                                                                                           // 184
};                                                                                                   // 185
                                                                                                     // 186
// returns {                                                                                         // 187
//   success: Boolean,                                                                               // 188
//   failureMsg: String,                                                                             // 189
//   neighbors: [state]                                                                              // 190
// }                                                                                                 // 191
ConstraintSolver.Resolver.prototype._stateNeighbors = function (                                     // 192
    state, resolutionPriority) {                                                                     // 193
  var self = this;                                                                                   // 194
                                                                                                     // 195
  var candidateName = null;                                                                          // 196
  var candidateVersions = null;                                                                      // 197
  var currentNaughtiness = -1;                                                                       // 198
                                                                                                     // 199
  state.eachDependency(function (unitName, versions) {                                               // 200
    var r = resolutionPriority[unitName] || 0;                                                       // 201
    if (r > currentNaughtiness) {                                                                    // 202
      currentNaughtiness = r;                                                                        // 203
      candidateName = unitName;                                                                      // 204
      candidateVersions = versions;                                                                  // 205
    }                                                                                                // 206
  });                                                                                                // 207
                                                                                                     // 208
  if (mori.is_empty(candidateVersions))                                                              // 209
    throw Error("empty candidate set? should have detected earlier");                                // 210
                                                                                                     // 211
  var pathway = state.somePathwayForUnitName(candidateName);                                         // 212
                                                                                                     // 213
  var neighbors = [];                                                                                // 214
  var firstError = null;                                                                             // 215
  mori.each(candidateVersions, function (unitVersion) {                                              // 216
    var neighborState = state.addChoice(unitVersion, pathway);                                       // 217
    if (!neighborState.error) {                                                                      // 218
      neighbors.push(neighborState);                                                                 // 219
    } else if (!firstError) {                                                                        // 220
      firstError = neighborState.error;                                                              // 221
    }                                                                                                // 222
  });                                                                                                // 223
                                                                                                     // 224
  if (neighbors.length) {                                                                            // 225
    return { success: true, neighbors: neighbors };                                                  // 226
  }                                                                                                  // 227
  return {                                                                                           // 228
    success: false,                                                                                  // 229
    failureMsg: firstError,                                                                          // 230
    conflictingUnit: candidateName                                                                   // 231
  };                                                                                                 // 232
};                                                                                                   // 233
                                                                                                     // 234
////////////////////////////////////////////////////////////////////////////////                     // 235
// UnitVersion                                                                                       // 236
////////////////////////////////////////////////////////////////////////////////                     // 237
                                                                                                     // 238
ConstraintSolver.UnitVersion = function (name, unitVersion) {                                        // 239
  var self = this;                                                                                   // 240
                                                                                                     // 241
  check(name, String);                                                                               // 242
  check(unitVersion, String);                                                                        // 243
  check(self, ConstraintSolver.UnitVersion);                                                         // 244
                                                                                                     // 245
  self.name = name;                                                                                  // 246
  // Things with different build IDs should represent the same code, so ignore                       // 247
  // them. (Notably: depending on @=1.3.1 should allow 1.3.1+local!)                                 // 248
  // XXX we no longer automatically add build IDs to things as part of our build                     // 249
  // process, but this still reflects semver semantics.                                              // 250
  self.version = PackageVersion.removeBuildID(unitVersion);                                          // 251
  self.dependencies = [];                                                                            // 252
  self.constraints = new ConstraintSolver.ConstraintsList();                                         // 253
  // integer like 1 or 2                                                                             // 254
  self.majorVersion = PackageVersion.majorVersion(unitVersion);                                      // 255
};                                                                                                   // 256
                                                                                                     // 257
_.extend(ConstraintSolver.UnitVersion.prototype, {                                                   // 258
  addDependency: function (name) {                                                                   // 259
    var self = this;                                                                                 // 260
                                                                                                     // 261
    check(name, String);                                                                             // 262
    if (_.contains(self.dependencies, name)) {                                                       // 263
      return;                                                                                        // 264
    }                                                                                                // 265
    self.dependencies.push(name);                                                                    // 266
  },                                                                                                 // 267
  addConstraint: function (constraint) {                                                             // 268
    var self = this;                                                                                 // 269
                                                                                                     // 270
    check(constraint, ConstraintSolver.Constraint);                                                  // 271
    if (self.constraints.contains(constraint)) {                                                     // 272
      return;                                                                                        // 273
      // XXX may also throw if it is unexpected                                                      // 274
      throw new Error("Constraint already exists -- " + constraint.toString());                      // 275
    }                                                                                                // 276
                                                                                                     // 277
    self.constraints = self.constraints.push(constraint);                                            // 278
  },                                                                                                 // 279
                                                                                                     // 280
  toString: function () {                                                                            // 281
    var self = this;                                                                                 // 282
    return self.name + "@" + self.version;                                                           // 283
  }                                                                                                  // 284
});                                                                                                  // 285
                                                                                                     // 286
////////////////////////////////////////////////////////////////////////////////                     // 287
// Constraint                                                                                        // 288
////////////////////////////////////////////////////////////////////////////////                     // 289
                                                                                                     // 290
// Can be called either:                                                                             // 291
//    new PackageVersion.Constraint("packageA", "=2.1.0")                                            // 292
// or:                                                                                               // 293
//    new PackageVersion.Constraint("pacakgeA@=2.1.0")                                               // 294
ConstraintSolver.Constraint = function (name, constraintString) {                                    // 295
  var self = this;                                                                                   // 296
                                                                                                     // 297
  var parsed = PackageVersion.parsePackageConstraint(name, constraintString);                        // 298
                                                                                                     // 299
  self.name = parsed.package;                                                                        // 300
  self.constraintString = parsed.constraintString;                                                   // 301
  // The results of parsing are `||`-separated alternatives, simple                                  // 302
  // constraints like `1.0.0` or `=1.0.1` which have been parsed into                                // 303
  // objects with a `type` and `versionString` property.                                             // 304
  self.alternatives = parsed.versionConstraint.alternatives;                                         // 305
};                                                                                                   // 306
                                                                                                     // 307
ConstraintSolver.Constraint.prototype.toString = function (options) {                                // 308
  var self = this;                                                                                   // 309
  return self.name + "@" + self.constraintString;                                                    // 310
};                                                                                                   // 311
                                                                                                     // 312
                                                                                                     // 313
ConstraintSolver.Constraint.prototype.isSatisfied = function (                                       // 314
  candidateUV, resolveContext) {                                                                     // 315
  var self = this;                                                                                   // 316
  check(candidateUV, ConstraintSolver.UnitVersion);                                                  // 317
                                                                                                     // 318
  if (self.name !== candidateUV.name) {                                                              // 319
    throw Error("asking constraint on " + self.name + " about " +                                    // 320
                candidateUV.name);                                                                   // 321
  }                                                                                                  // 322
                                                                                                     // 323
  var prereleaseNeedingLicense = false;                                                              // 324
                                                                                                     // 325
  // We try not to allow "pre-release" versions (versions with a '-') unless                         // 326
  // they are explicitly mentioned.  If the `anticipatedPrereleases` option is                       // 327
  // `true` set, all pre-release versions are allowed.  Otherwise,                                   // 328
  // anticipatedPrereleases lists pre-release versions that are always allow                         // 329
  // (this corresponds to pre-release versions mentioned explicitly in                               // 330
  // *top-level* constraints).                                                                       // 331
  //                                                                                                 // 332
  // Otherwise, if `candidateUV` is a pre-release, it needs to be "licensed" by                      // 333
  // being mentioned by name in *this* constraint or matched by an inexact                           // 334
  // constraint whose version also has a '-'.                                                        // 335
  //                                                                                                 // 336
  // Note that a constraint "@2.0.0" can never match a version "2.0.1-rc.1"                          // 337
  // unless anticipatedPrereleases allows it, even if another constraint found                       // 338
  // in the graph (but not at the top level) explicitly mentions "2.0.1-rc.1".                       // 339
  // Why? The constraint solver assumes that adding a constraint to the resolver                     // 340
  // state can't make previously impossible choices now possible.  If                                // 341
  // pre-releases mentioned anywhere worked, then applying the constraint                            // 342
  // "@2.0.0" followed by "@=2.0.1-rc.1" would result in "2.0.1-rc.1" ruled                          // 343
  // first impossible and then possible again. That will break this algorith, so                     // 344
  // we have to fix the meaning based on something known at the start of the                         // 345
  // search.  (We could try to apply our prerelease-avoidance tactics solely in                      // 346
  // the cost functions, but then it becomes a much less strict rule.)                               // 347
  if (resolveContext.anticipatedPrereleases !== true                                                 // 348
      && /-/.test(candidateUV.version)) {                                                            // 349
    var isAnticipatedPrerelease = (                                                                  // 350
      _.has(resolveContext.anticipatedPrereleases, self.name) &&                                     // 351
        _.has(resolveContext.anticipatedPrereleases[self.name],                                      // 352
              candidateUV.version));                                                                 // 353
    if (! isAnticipatedPrerelease) {                                                                 // 354
      prereleaseNeedingLicense = true;                                                               // 355
    }                                                                                                // 356
  }                                                                                                  // 357
                                                                                                     // 358
  return _.some(self.alternatives, function (simpleConstraint) {                                     // 359
    var type = simpleConstraint.type;                                                                // 360
                                                                                                     // 361
    if (type === "any-reasonable") {                                                                 // 362
      return ! prereleaseNeedingLicense;                                                             // 363
    } else if (type === "exactly") {                                                                 // 364
      var version = simpleConstraint.versionString;                                                  // 365
      return (version === candidateUV.version);                                                      // 366
    } else if (type === 'compatible-with') {                                                         // 367
      var version = simpleConstraint.versionString;                                                  // 368
                                                                                                     // 369
      if (prereleaseNeedingLicense && ! /-/.test(version)) {                                         // 370
        return false;                                                                                // 371
      }                                                                                              // 372
                                                                                                     // 373
      // If the candidate version is less than the version named in the                              // 374
      // constraint, we are not satisfied.                                                           // 375
      if (PackageVersion.lessThan(candidateUV.version, version)) {                                   // 376
        return false;                                                                                // 377
      }                                                                                              // 378
                                                                                                     // 379
      // To be compatible, the two versions must have the same major version                         // 380
      // number.                                                                                     // 381
      if (candidateUV.majorVersion !== PackageVersion.majorVersion(version)) {                       // 382
        return false;                                                                                // 383
      }                                                                                              // 384
                                                                                                     // 385
      return true;                                                                                   // 386
    } else {                                                                                         // 387
      throw Error("Unknown constraint type: " + type);                                               // 388
    }                                                                                                // 389
  });                                                                                                // 390
};                                                                                                   // 391
                                                                                                     // 392
// An object that records the general context of a resolve call. It can be                           // 393
// different for different resolve calls on the same Resolver, but is the same                       // 394
// for every ResolverState in a given call.                                                          // 395
var ResolveContext = function (anticipatedPrereleases) {                                             // 396
  var self = this;                                                                                   // 397
  // EITHER: "true", in which case all prereleases are anticipated, or a map                         // 398
  //         unitName -> version string -> true                                                      // 399
  self.anticipatedPrereleases = anticipatedPrereleases;                                              // 400
};                                                                                                   // 401
                                                                                                     // 402
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraints-list.js                                                    //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
////////////////////////////////////////////////////////////////////////////////                     // 1
// ConstraintsList                                                                                   // 2
////////////////////////////////////////////////////////////////////////////////                     // 3
// A persistent data-structure that keeps references to Constraint objects                           // 4
// arranged by the "name" field of Constraint and exactness of the constraint.                       // 5
//                                                                                                   // 6
// Internal structure has two maps, 'exact' and 'inexact'; they each map                             // 7
// unit name -> mori.set(Constraint).  (This relies on the fact that Constraints                     // 8
// are interned, so that mori.set can use reference identity.)                                       // 9
//                                                                                                   // 10
// We separate the constraints by exactness so that the iteration functions                          // 11
// (forPackage and each) can easily provide exact constraints before inexact                         // 12
// constraints, because exact constraints generally help the consumer pare down                      // 13
// their possibilities faster.                                                                       // 14
// XXX This is just a theory, and it's not clear that we have benchmarks that                        // 15
//     prove it.                                                                                     // 16
ConstraintSolver.ConstraintsList = function (prev) {                                                 // 17
  var self = this;                                                                                   // 18
                                                                                                     // 19
  if (prev) {                                                                                        // 20
    self.exact = prev.exact;                                                                         // 21
    self.inexact = prev.inexact;                                                                     // 22
    self.minimalVersion = prev.minimalVersion;                                                       // 23
  } else {                                                                                           // 24
    self.exact = mori.hash_map();                                                                    // 25
    self.inexact = mori.hash_map();                                                                  // 26
    self.minimalVersion = mori.hash_map();                                                           // 27
  }                                                                                                  // 28
};                                                                                                   // 29
                                                                                                     // 30
ConstraintSolver.ConstraintsList.prototype.contains = function (c) {                                 // 31
  var self = this;                                                                                   // 32
  var map = c.type === 'exactly' ? self.exact : self.inexact;                                        // 33
  return !!mori.get_in(map, [c.name, c]);                                                            // 34
};                                                                                                   // 35
                                                                                                     // 36
ConstraintSolver.ConstraintsList.prototype.getMinimalVersion = function (name) {                     // 37
  var self = this;                                                                                   // 38
  return mori.get(self.minimalVersion, name);                                                        // 39
};                                                                                                   // 40
                                                                                                     // 41
// returns a new version containing passed constraint                                                // 42
ConstraintSolver.ConstraintsList.prototype.push = function (c) {                                     // 43
  var self = this;                                                                                   // 44
                                                                                                     // 45
  if (self.contains(c)) {                                                                            // 46
    return self;                                                                                     // 47
  }                                                                                                  // 48
                                                                                                     // 49
  var newList = new ConstraintSolver.ConstraintsList(self);                                          // 50
  var mapField = c.type === 'exactly' ? 'exact' : 'inexact';                                         // 51
  // Get the current constraints on this package of the exactness, or an empty                       // 52
  // set.                                                                                            // 53
  var currentConstraints = mori.get(newList[mapField], c.name, mori.set());                          // 54
  // Add this one.                                                                                   // 55
  newList[mapField] = mori.assoc(newList[mapField],                                                  // 56
                                 c.name,                                                             // 57
                                 mori.conj(currentConstraints, c));                                  // 58
                                                                                                     // 59
  // Maintain the "minimal version" that can satisfy these constraints.                              // 60
  // Note that this is one of the only pieces of the constraint solver that                          // 61
  // actually does logic on constraints (and thus relies on the restricted set                       // 62
  // of constraints that we support).                                                                // 63
  if (c.type !== 'any-reasonable') {                                                                 // 64
    var minimal = mori.get(newList.minimalVersion, c.name);                                          // 65
    if (!minimal || PackageVersion.lessThan(c.version, minimal)) {                                   // 66
      newList.minimalVersion = mori.assoc(                                                           // 67
        newList.minimalVersion, c.name, c.version);                                                  // 68
    }                                                                                                // 69
  }                                                                                                  // 70
  return newList;                                                                                    // 71
};                                                                                                   // 72
                                                                                                     // 73
ConstraintSolver.ConstraintsList.prototype.forPackage = function (name, iter) {                      // 74
  var self = this;                                                                                   // 75
  var exact = mori.get(self.exact, name);                                                            // 76
  var inexact = mori.get(self.inexact, name);                                                        // 77
                                                                                                     // 78
  var breaked = false;                                                                               // 79
  var niter = function (constraint) {                                                                // 80
    if (iter(constraint) === BREAK) {                                                                // 81
      breaked = true;                                                                                // 82
      return true;                                                                                   // 83
    }                                                                                                // 84
  };                                                                                                 // 85
                                                                                                     // 86
  exact && mori.some(niter, exact);                                                                  // 87
  if (breaked)                                                                                       // 88
    return;                                                                                          // 89
  inexact && mori.some(niter, inexact);                                                              // 90
};                                                                                                   // 91
                                                                                                     // 92
// doesn't break on the false return value                                                           // 93
ConstraintSolver.ConstraintsList.prototype.each = function (iter) {                                  // 94
  var self = this;                                                                                   // 95
  _.each([self.exact, self.inexact], function (map) {                                                // 96
    mori.each(map, function (nameAndConstraints) {                                                   // 97
      mori.each(mori.last(nameAndConstraints), iter);                                                // 98
    });                                                                                              // 99
  });                                                                                                // 100
};                                                                                                   // 101
                                                                                                     // 102
// Checks if the passed unit version satisfies all of the constraints.                               // 103
ConstraintSolver.ConstraintsList.prototype.isSatisfied = function (                                  // 104
    uv, resolveContext) {                                                                            // 105
  var self = this;                                                                                   // 106
                                                                                                     // 107
  var satisfied = true;                                                                              // 108
                                                                                                     // 109
  self.forPackage(uv.name, function (c) {                                                            // 110
    if (! c.isSatisfied(uv, resolveContext)) {                                                       // 111
      satisfied = false;                                                                             // 112
      return BREAK;                                                                                  // 113
    }                                                                                                // 114
  });                                                                                                // 115
                                                                                                     // 116
  return satisfied;                                                                                  // 117
};                                                                                                   // 118
                                                                                                     // 119
ConstraintSolver.ConstraintsList.prototype.toString = function () {                                  // 120
  var self = this;                                                                                   // 121
                                                                                                     // 122
  var strs = [];                                                                                     // 123
                                                                                                     // 124
  self.each(function (c) {                                                                           // 125
    strs.push(c.toString());                                                                         // 126
  });                                                                                                // 127
                                                                                                     // 128
  strs = _.uniq(strs);                                                                               // 129
                                                                                                     // 130
  return "<constraints list: " + strs.join(", ") + ">";                                              // 131
};                                                                                                   // 132
                                                                                                     // 133
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/resolver-state.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var util = Npm.require('util');                                                                      // 1
                                                                                                     // 2
ResolverState = function (resolver, resolveContext) {                                                // 3
  var self = this;                                                                                   // 4
  self._resolver = resolver;                                                                         // 5
  self._resolveContext = resolveContext;                                                             // 6
  // The versions we've already chosen.                                                              // 7
  // unitName -> UnitVersion                                                                         // 8
  self.choices = mori.hash_map();                                                                    // 9
  // Units we need, but haven't chosen yet.                                                          // 10
  // unitName -> sorted vector of (UnitVersions)                                                     // 11
  self._dependencies = mori.hash_map();                                                              // 12
  // Constraints that apply.                                                                         // 13
  self.constraints = new ConstraintSolver.ConstraintsList;                                           // 14
  // How we've decided things about units.                                                           // 15
  // unitName -> set(list (reversed) of UVs that led us here).                                       // 16
  self._unitPathways = mori.hash_map();                                                              // 17
  // If we've already hit a contradiction.                                                           // 18
  self.error = null;                                                                                 // 19
};                                                                                                   // 20
                                                                                                     // 21
_.extend(ResolverState.prototype, {                                                                  // 22
  addConstraint: function (constraint, pathway) {                                                    // 23
    var self = this;                                                                                 // 24
    if (self.error)                                                                                  // 25
      return self;                                                                                   // 26
                                                                                                     // 27
    // Add the constraint.                                                                           // 28
    var newConstraints = self.constraints.push(constraint);                                          // 29
    // If we already had the constraint, we're done.                                                 // 30
    if (self.constraints === newConstraints)                                                         // 31
      return self;                                                                                   // 32
                                                                                                     // 33
    self = self._clone();                                                                            // 34
    self.constraints = newConstraints;                                                               // 35
    self._addPathway(constraint.name, pathway);                                                      // 36
                                                                                                     // 37
    var chosen = mori.get(self.choices, constraint.name);                                            // 38
    if (chosen &&                                                                                    // 39
        !constraint.isSatisfied(chosen, self._resolveContext)) {                                     // 40
      // This constraint conflicts with a choice we've already made!                                 // 41
      self.error = util.format(                                                                      // 42
        "conflict: constraint %s is not satisfied by %s.\n" +                                        // 43
        "Constraints on %s come from:\n%s",                                                          // 44
        constraint.toString(),                                                                       // 45
        chosen.version,                                                                              // 46
        constraint.name,                                                                             // 47
        self._shownPathwaysForConstraintsIndented(constraint.name));                                 // 48
      return self;                                                                                   // 49
    }                                                                                                // 50
                                                                                                     // 51
    var alternatives = mori.get(self._dependencies, constraint.name);                                // 52
    if (alternatives) {                                                                              // 53
      // Note: filter preserves order, which is important.                                           // 54
      var newAlternatives = filter(alternatives, function (unitVersion) {                            // 55
        return constraint.isSatisfied(unitVersion, self._resolveContext);                            // 56
      });                                                                                            // 57
      if (mori.is_empty(newAlternatives)) {                                                          // 58
        self.error = util.format(                                                                    // 59
          "conflict: constraints on %s cannot all be satisfied.\n" +                                 // 60
            "Constraints come from:\n%s",                                                            // 61
          constraint.name,                                                                           // 62
          self._shownPathwaysForConstraintsIndented(constraint.name));                               // 63
      } else if (mori.count(newAlternatives) === 1) {                                                // 64
        // There's only one choice, so we can immediately choose it.                                 // 65
        self = self.addChoice(mori.first(newAlternatives), pathway);                                 // 66
      } else if (mori.count(newAlternatives) !== mori.count(alternatives)) {                         // 67
        self._dependencies = mori.assoc(                                                             // 68
          self._dependencies, constraint.name, newAlternatives);                                     // 69
      }                                                                                              // 70
    }                                                                                                // 71
    return self;                                                                                     // 72
  },                                                                                                 // 73
  addDependency: function (unitName, pathway) {                                                      // 74
    var self = this;                                                                                 // 75
                                                                                                     // 76
    if (self.error || mori.has_key(self.choices, unitName)                                           // 77
        || mori.has_key(self._dependencies, unitName)) {                                             // 78
      return self;                                                                                   // 79
    }                                                                                                // 80
                                                                                                     // 81
    self = self._clone();                                                                            // 82
                                                                                                     // 83
    if (!_.has(self._resolver.unitsVersions, unitName)) {                                            // 84
      self.error = "unknown package: " + unitName;                                                   // 85
      return self;                                                                                   // 86
    }                                                                                                // 87
                                                                                                     // 88
    // Note: relying on sortedness of unitsVersions so that alternatives is                          // 89
    // sorted too (the estimation function uses this).                                               // 90
    var alternatives = filter(self._resolver.unitsVersions[unitName], function (uv) {                // 91
      return self.isSatisfied(uv);                                                                   // 92
      // XXX hang on to list of violated constraints and use it in error                             // 93
      // message                                                                                     // 94
    });                                                                                              // 95
                                                                                                     // 96
    if (mori.is_empty(alternatives)) {                                                               // 97
      self.error = util.format(                                                                      // 98
        "conflict: constraints on %s cannot be satisfied.\n" +                                       // 99
          "Constraints come from:\n%s",                                                              // 100
        unitName,                                                                                    // 101
        self._shownPathwaysForConstraintsIndented(unitName));                                        // 102
      return self;                                                                                   // 103
    } else if (mori.count(alternatives) === 1) {                                                     // 104
      // There's only one choice, so we can immediately choose it.                                   // 105
      self = self.addChoice(mori.first(alternatives), pathway);                                      // 106
    } else {                                                                                         // 107
      self._dependencies = mori.assoc(                                                               // 108
        self._dependencies, unitName, alternatives);                                                 // 109
      self._addPathway(unitName, pathway);                                                           // 110
    }                                                                                                // 111
                                                                                                     // 112
    return self;                                                                                     // 113
  },                                                                                                 // 114
  addChoice: function (uv, pathway) {                                                                // 115
    var self = this;                                                                                 // 116
                                                                                                     // 117
    if (self.error)                                                                                  // 118
      return self;                                                                                   // 119
    if (mori.has_key(self.choices, uv.name))                                                         // 120
      throw Error("Already chose " + uv.name);                                                       // 121
                                                                                                     // 122
    self = self._clone();                                                                            // 123
                                                                                                     // 124
    // Does adding this choice break some constraints we already have?                               // 125
    if (!self.isSatisfied(uv)) {                                                                     // 126
      // This shouldn't happen: all calls to addChoice should occur based on                         // 127
      // choosing it from a list of satisfied alternatives.                                          // 128
      throw new Error("try to choose an unsatisfied version?");                                      // 129
    }                                                                                                // 130
                                                                                                     // 131
    // Great, move it from dependencies to choices.                                                  // 132
    self.choices = mori.assoc(self.choices, uv.name, uv);                                            // 133
    self._dependencies = mori.dissoc(self._dependencies, uv.name);                                   // 134
    self._addPathway(uv.name, pathway);                                                              // 135
                                                                                                     // 136
    // Since we're committing to this version, we're committing to all it                            // 137
    // implies.                                                                                      // 138
    var pathwayIncludingUv = mori.cons(uv, pathway);                                                 // 139
    uv.constraints.each(function (constraint) {                                                      // 140
      self = self.addConstraint(constraint, pathwayIncludingUv);                                     // 141
    });                                                                                              // 142
    _.each(uv.dependencies, function (unitName) {                                                    // 143
      self = self.addDependency(unitName, pathwayIncludingUv);                                       // 144
    });                                                                                              // 145
                                                                                                     // 146
    return self;                                                                                     // 147
  },                                                                                                 // 148
  // this mutates self, so only call on a newly _clone'd and not yet returned                        // 149
  // object.                                                                                         // 150
  _addPathway: function (unitName, pathway) {                                                        // 151
    var self = this;                                                                                 // 152
    self._unitPathways = mori.assoc(                                                                 // 153
      self._unitPathways, unitName,                                                                  // 154
      mori.conj(mori.get(self._unitPathways, unitName, mori.set()),                                  // 155
                pathway));                                                                           // 156
  },                                                                                                 // 157
  success: function () {                                                                             // 158
    var self = this;                                                                                 // 159
    return !self.error && mori.is_empty(self._dependencies);                                         // 160
  },                                                                                                 // 161
  eachDependency: function (iter) {                                                                  // 162
    var self = this;                                                                                 // 163
    mori.some(function (nameAndAlternatives) {                                                       // 164
      return BREAK == iter(mori.first(nameAndAlternatives),                                          // 165
                           mori.last(nameAndAlternatives));                                          // 166
    }, self._dependencies);                                                                          // 167
  },                                                                                                 // 168
  isSatisfied: function (uv) {                                                                       // 169
    var self = this;                                                                                 // 170
    return self.constraints.isSatisfied(uv, self._resolveContext);                                   // 171
  },                                                                                                 // 172
  somePathwayForUnitName: function (unitName) {                                                      // 173
    var self = this;                                                                                 // 174
    var pathways = mori.get(self._unitPathways, unitName);                                           // 175
    if (!pathways)                                                                                   // 176
      return mori.list();                                                                            // 177
    return mori.first(pathways);                                                                     // 178
  },                                                                                                 // 179
  _clone: function () {                                                                              // 180
    var self = this;                                                                                 // 181
    var clone = new ResolverState(self._resolver, self._resolveContext);                             // 182
    _.each(['choices', '_dependencies', 'constraints', 'error', '_unitPathways'], function (field) { // 183
      clone[field] = self[field];                                                                    // 184
    });                                                                                              // 185
    return clone;                                                                                    // 186
  },                                                                                                 // 187
  _shownPathwaysForConstraints: function (unitName) {                                                // 188
    var self = this;                                                                                 // 189
    var pathways = mori.into_array(mori.map(function (pathway) {                                     // 190
      return showPathway(pathway, unitName);                                                         // 191
    }, mori.get(self._unitPathways, unitName)));                                                     // 192
    pathways.sort();                                                                                 // 193
    pathways = _.uniq(pathways, true);                                                               // 194
    return pathways;                                                                                 // 195
  },                                                                                                 // 196
  _shownPathwaysForConstraintsIndented: function (unitName) {                                        // 197
    var self = this;                                                                                 // 198
    return _.map(self._shownPathwaysForConstraints(unitName), function (pathway) {                   // 199
      return "  " + (pathway ? pathway : "<top level>");                                             // 200
    }).join("\n");                                                                                   // 201
  }                                                                                                  // 202
});                                                                                                  // 203
                                                                                                     // 204
// Helper for filtering a vector in mori. mori.filter returns a lazy sequence,                       // 205
// which is cool, but we actually do want to coerce to a vector since we (eg the                     // 206
// estimation function) runs mori.last on it a bunch and we'd like to only                           // 207
// do the O(n) work once.                                                                            // 208
var filter = function (v, pred) {                                                                    // 209
  return mori.into(mori.vector(), mori.filter(pred, v));                                             // 210
};                                                                                                   // 211
                                                                                                     // 212
// XXX from Underscore.String (http://epeli.github.com/underscore.string/)                           // 213
// XXX how many copies of this do we have in Meteor?                                                 // 214
var startsWith = function(str, starts) {                                                             // 215
  return str.length >= starts.length &&                                                              // 216
    str.substring(0, starts.length) === starts;                                                      // 217
};                                                                                                   // 218
                                                                                                     // 219
var showPathway = function (pathway, dropIfFinal) {                                                  // 220
  var pathUnits = mori.into_array(mori.map(function (uv) {                                           // 221
    return uv.toString();                                                                            // 222
  }, mori.reverse(pathway)));                                                                        // 223
                                                                                                     // 224
  var dropPrefix = dropIfFinal + '@';                                                                // 225
  while (pathUnits.length && startsWith(_.last(pathUnits), dropPrefix)) {                            // 226
    pathUnits.pop();                                                                                 // 227
  }                                                                                                  // 228
                                                                                                     // 229
  return pathUnits.join(' -> ');                                                                     // 230
};                                                                                                   // 231
                                                                                                     // 232
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/priority-queue.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
PriorityQueue = function () {                                                                        // 1
  var self = this;                                                                                   // 2
  var compareArrays = function (a, b) {                                                              // 3
    for (var i = 0; i < a.length; i++)                                                               // 4
      if (a[i] !== b[i])                                                                             // 5
        if (a[i] instanceof Array)                                                                   // 6
          return compareArrays(a[i], b[i]);                                                          // 7
        else                                                                                         // 8
          return a[i] - b[i];                                                                        // 9
                                                                                                     // 10
    return 0;                                                                                        // 11
  };                                                                                                 // 12
  // id -> cost                                                                                      // 13
  self._heap = new MinHeap(function (a, b) {                                                         // 14
    return compareArrays(a, b);                                                                      // 15
  });                                                                                                // 16
                                                                                                     // 17
  // id -> reference to item                                                                         // 18
  self._items = {};                                                                                  // 19
};                                                                                                   // 20
                                                                                                     // 21
_.extend(PriorityQueue.prototype, {                                                                  // 22
  push: function (item, cost) {                                                                      // 23
    var self = this;                                                                                 // 24
    var id = Random.id();                                                                            // 25
    self._heap.set(id, cost);                                                                        // 26
    self._items[id] = item;                                                                          // 27
  },                                                                                                 // 28
  top: function () {                                                                                 // 29
    var self = this;                                                                                 // 30
                                                                                                     // 31
    if (self.empty())                                                                                // 32
      throw new Error("The queue is empty");                                                         // 33
                                                                                                     // 34
    var id = self._heap.minElementId();                                                              // 35
    return self._items[id];                                                                          // 36
  },                                                                                                 // 37
  pop: function () {                                                                                 // 38
    var self = this;                                                                                 // 39
                                                                                                     // 40
    if (self.empty())                                                                                // 41
      throw new Error("The queue is empty");                                                         // 42
                                                                                                     // 43
    var id = self._heap.minElementId();                                                              // 44
    var item = self._items[id];                                                                      // 45
                                                                                                     // 46
    delete self._items[id];                                                                          // 47
    self._heap.remove(id);                                                                           // 48
                                                                                                     // 49
    return item;                                                                                     // 50
  },                                                                                                 // 51
  empty: function () {                                                                               // 52
    var self = this;                                                                                 // 53
    return self._heap.empty();                                                                       // 54
  },                                                                                                 // 55
  size: function () {                                                                                // 56
    var self = this;                                                                                 // 57
    return self._heap.size();                                                                        // 58
  }                                                                                                  // 59
});                                                                                                  // 60
                                                                                                     // 61
                                                                                                     // 62
                                                                                                     // 63
///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
