(function () {

/* Imports */
var Meteor = Package.meteor.Meteor;
var _ = Package.underscore._;
var EJSON = Package.ejson.EJSON;
var check = Package.check.check;
var Match = Package.check.Match;
var PackageVersion = Package['package-version-parser'].PackageVersion;
var MaxHeap = Package['binary-heap'].MaxHeap;
var MinHeap = Package['binary-heap'].MinHeap;
var MinMaxHeap = Package['binary-heap'].MinMaxHeap;
var Random = Package.random.Random;

/* Package-scope variables */
var ConstraintSolver, mori, BREAK, ResolverState, PriorityQueue;

(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/datatypes.js                                                           //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
ConstraintSolver = {};

var PV = PackageVersion;
var CS = ConstraintSolver;

////////// PackageAndVersion

// An ordered pair of (package, version).
CS.PackageAndVersion = function (package, version) {
  check(package, String);
  check(version, String);

  this.package = package;
  this.version = version;
};

// The string form of a PackageAndVersion is "package version",
// for example "foo 1.0.1".  The reason we don't use an "@" is
// it would look too much like a PackageConstraint.
CS.PackageAndVersion.prototype.toString = function () {
  return this.package + " " + this.version;
};

CS.PackageAndVersion.fromString = function (str) {
  var parts = str.split(' ');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return new CS.PackageAndVersion(parts[0], parts[1]);
  } else {
    throw new Error("Malformed PackageAndVersion: " + str);
  }
};

////////// Dependency

// A Dependency consists of a PackageConstraint (like "foo@=1.2.3")
// and flags, like "isWeak".

CS.Dependency = function (packageConstraint, flags) {
  check(packageConstraint, Match.OneOf(PV.PackageConstraint, String));
  if (typeof packageConstraint === 'string') {
    packageConstraint = PV.parsePackageConstraint(packageConstraint);
  }
  if (flags) {
    check(flags, Object);
  }

  this.packageConstraint = packageConstraint;
  this.isWeak = false;

  if (flags) {
    if (flags.isWeak) {
      this.isWeak = true;
    }
  }
};

// The string form of a Dependency is `?foo@1.0.0` for a weak
// reference to package "foo" with VersionConstraint "1.0.0".
CS.Dependency.prototype.toString = function () {
  var ret = this.packageConstraint.toString();
  if (this.isWeak) {
    ret = '?' + ret;
  }
  return ret;
};

CS.Dependency.fromString = function (str) {
  var isWeak = false;

  if (str.charAt(0) === '?') {
    isWeak = true;
    str = str.slice(1);
  }

  var flags = isWeak ? { isWeak: true } : null;

  return new CS.Dependency(str, flags);
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/catalog-cache.js                                                       //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var CS = ConstraintSolver;

var pvkey = function (package, version) {
  return package + " " + version;
};

// Stores the Dependencies for each known PackageAndVersion.
CS.CatalogCache = function () {
  // String(PackageAndVersion) -> String -> Dependency.
  // For example, "foo 1.0.0" -> "bar" -> Dependency.fromString("?bar@1.0.2").
  this._dependencies = {};
  // A map derived from the keys of _dependencies, for ease of iteration.
  // "foo" -> ["1.0.0", ...]
  // Versions in the array are unique but not sorted.
  this._versions = {};
};

CS.CatalogCache.prototype.hasPackageVersion = function (package, version) {
  return _.has(this._dependencies, pvkey(package, version));
};

CS.CatalogCache.prototype.addPackageVersion = function (p, v, deps) {
  check(p, String);
  check(v, String);
  // `deps` must not have any duplicate values of `.packageConstraint.package`
  check(deps, [CS.Dependency]);

  var key = pvkey(p, v);
  if (_.has(this._dependencies, key)) {
    throw new Error("Already have an entry for " + key);
  }

  if (! _.has(this._versions, p)) {
    this._versions[p] = [];
  }
  this._versions[p].push(v);

  var depsByPackage = {};
  this._dependencies[key] = depsByPackage;
  _.each(deps, function (d) {
    var p2 = d.packageConstraint.package;
    if (_.has(depsByPackage, p2)) {
      throw new Error("Can't have two dependencies on " + p2 +
                      " in " + key);
    }
    depsByPackage[p2] = d;
  });
};

// Returns the dependencies of a (package, version), stored in a map.
// The values are Dependency objects; the key for `d` is
// `d.packageConstraint.package`.  (Don't mutate the map.)
CS.CatalogCache.prototype.getDependencyMap = function (p, v) {
  var key = pvkey(p, v);
  if (! _.has(this._dependencies, key)) {
    throw new Error("No entry for " + key);
  }
  return this._dependencies[key];
};

// Returns an array of version strings, unsorted, possibly empty.
// (Don't mutate the result.)
CS.CatalogCache.prototype.getPackageVersions = function (package) {
  return (_.has(this._versions, package) ?
          this._versions[package] : []);
};

CS.CatalogCache.prototype.toJSONable = function () {
  var self = this;
  var data = {};
  _.each(self._dependencies, function (depsByPackage, key) {
    // depsByPackage is a map of String -> Dependency.
    // Map over the values to get an array of String.
    data[key] = _.map(depsByPackage, function (dep) {
      return dep.toString();
    });
  });
  return { data: data };
};

CS.CatalogCache.fromJSONable = function (obj) {
  check(obj, { data: Object });

  var cache = new CS.CatalogCache();
  _.each(obj.data, function (depsArray, pv) {
    check(depsArray, [String]);
    pv = CS.PackageAndVersion.fromString(pv);
    cache.addPackageVersion(
      pv.package, pv.version,
      _.map(depsArray, function (str) {
        return CS.Dependency.fromString(str);
      }));
  });
  return cache;
};

// Calls `iter` on each PackageAndVersion, with the second argument being
// a map from package name to Dependency.  If `iter` returns true,
// iteration is stopped.
CS.CatalogCache.prototype.eachPackageVersion = function (iter) {
  var self = this;
  _.find(self._dependencies, function (value, key) {
    var stop = iter(CS.PackageAndVersion.fromString(key), value);
    return stop;
  });
};

// Calls `iter` on each package name, with the second argument being
// a list of versions present for that package (unique but not sorted).
// If `iter` returns true, iteration is stopped.
ConstraintSolver.CatalogCache.prototype.eachPackage = function (iter) {
  var self = this;
  _.find(_.keys(self._versions), function (key) {
    var stop = iter(key, self.getPackageVersions(key));
    return stop;
  });
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/catalog-loader.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;
var CS = ConstraintSolver;

// A CatalogLoader populates the CatalogCache from the Catalog.  When
// running unit tests with no Catalog and canned data for the
// CatalogCache, there will be no CatalogLoader.
//
// Fine-grained Loading: While we don't currently support loading only
// some versions of a package, CatalogLoader is meant to be extended
// to support incrementally loading individual package versions.  It
// has no concept of a "loaded package," for example, just a loaded
// package version.  CatalogLoader's job, in principle, is to load
// package versions efficiently, no matter the access pattern, by
// making the right catalog calls and doing the right caching.
// Calling a catalog method generally means running a SQLite query,
// which could be time-consuming.

CS.CatalogLoader = function (fromCatalog, toCatalogCache) {
  var self = this;

  self.catalog = fromCatalog;
  self.catalogCache = toCatalogCache;

  self._sortedVersionRecordsCache = {};
};

// We rely on the following `catalog` methods:
//
// * getSortedVersionRecords(packageName) ->
//     [{packageName, version, dependencies}]
//
//   Where `dependencies` is a map from packageName to
//   an object of the form `{ constraint: String|null,
//   references: [{arch: String, optional "weak": true}] }`.

var convertDeps = function (catalogDeps) {
  return _.map(catalogDeps, function (dep, package) {
    // The dependency is strong if any of its "references"
    // (for different architectures) are strong.
    var isStrong = _.any(dep.references, function (ref) {
      return !ref.weak;
    });

    var constraint = (dep.constraint || null);

    return new CS.Dependency(new PV.PackageConstraint(package, constraint),
                             isStrong ? null : {isWeak: true});
  });
};

// Since we don't fetch different versions of a package independently
// at the moment, this helper is where we get our data.
CS.CatalogLoader.prototype._getSortedVersionRecords = function (package) {
  if (! _.has(this._sortedVersionRecordsCache, package)) {
    this._sortedVersionRecordsCache[package] =
      this.catalog.getSortedVersionRecords(package);
  }

  return this._sortedVersionRecordsCache[package];
};

CS.CatalogLoader.prototype.loadAllVersions = function (package) {
  var self = this;
  var cache = self.catalogCache;
  var versionRecs = self._getSortedVersionRecords(package);
  _.each(versionRecs, function (rec) {
    var version = rec.version;
    if (! cache.hasPackageVersion(package, version)) {
      var deps = convertDeps(rec.dependencies);
      cache.addPackageVersion(package, version, deps);
    }
  });
};

// Takes an array of package names.  Loads all versions of them and their
// (strong) dependencies.
CS.CatalogLoader.prototype.loadAllVersionsRecursive = function (packageList) {
  var self = this;

  // Within a call to loadAllVersionsRecursive, we only visit each package
  // at most once.  If we visit a package we've already loaded, it will
  // lead to a quick scan through the versions in our cache to make sure
  // they have been loaded into the CatalogCache.
  var loadQueue = [];
  var packagesEverEnqueued = {};

  var enqueue = function (package) {
    if (! _.has(packagesEverEnqueued, package)) {
      packagesEverEnqueued[package] = true;
      loadQueue.push(package);
    }
  };

  _.each(packageList, enqueue);

  while (loadQueue.length) {
    var package = loadQueue.pop();
    self.loadAllVersions(package);
    _.each(self.catalogCache.getPackageVersions(package), function (v) {
      var depMap = self.catalogCache.getDependencyMap(package, v);
      _.each(depMap, function (dep, package2) {
        enqueue(package2);
      });
    });
  }
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraint-solver-input.js                                             //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;
var CS = ConstraintSolver;

// The "Input" object completely specifies the input to the resolver,
// and it holds the data loaded from the Catalog as well.  It can be
// serialized to JSON and read back in for testing purposes.
CS.Input = function (dependencies, constraints, catalogCache, options) {
  options = options || {};

  this.dependencies = dependencies;
  this.constraints = constraints;
  this.upgrade = options.upgrade || [];
  this.anticipatedPrereleases = options.anticipatedPrereleases || {};
  this.previousSolution = options.previousSolution || null;

  check(this.dependencies, [String]);
  check(this.constraints, [PackageConstraintType]);
  check(this.upgrade, [String]);
  check(this.anticipatedPrereleases,
        Match.ObjectWithValues(Match.ObjectWithValues(Boolean)));
  check(this.previousSolution, Match.OneOf(Object, null));

  this.catalogCache = catalogCache;
};

CS.Input.prototype.loadFromCatalog = function (catalogLoader) {
  var self = this;

  var packagesToLoad = {}; // package -> true

  _.each(self.dependencies, function (package) {
    packagesToLoad[package] = true;
  });
  _.each(self.constraints, function (constraint) {
    packagesToLoad[constraint.package] = true;
  });
  _.each(self.previousSolution, function (version, package) {
    packagesToLoad[package] = true;
  });

  // Load packages into the cache (if they aren't loaded already).
  catalogLoader.loadAllVersionsRecursive(_.keys(packagesToLoad));
};

CS.Input.prototype.toJSONable = function () {
  var self = this;
  var obj = {
    dependencies: self.dependencies,
    constraints: _.map(self.constraints, function (c) {
      return c.toString();
    }),
    catalogCache: self.catalogCache.toJSONable()
  };
  // For readability of the resulting JSON, only include optional
  // properties that aren't the default.
  if (self.upgrade.length) {
    obj.upgrade = self.upgrade;
  }
  if (! _.isEmpty(self.anticipatedPrereleases)) {
    obj.anticipatedPrereleases = self.anticipatedPrereleases;
  }
  if (self.previousSolution !== null) {
    obj.previousSolution = self.previousSolution;
  };
  return obj;
};

CS.Input.fromJSONable = function (obj) {
  check(obj, {
    dependencies: [String],
    constraints: [String],
    catalogCache: Object,
    anticipatedPrereleases: Match.Optional(
      Match.ObjectWithValues(Match.ObjectWithValues(Boolean))),
    previousSolution: Match.Optional(Match.OneOf(Object, null)),
    upgrade: Match.Optional([String])
  });

  return new CS.Input(
    obj.dependencies,
    _.map(obj.constraints, function (cstr) {
      return PV.parsePackageConstraint(cstr);
    }),
    CS.CatalogCache.fromJSONable(obj.catalogCache),
    {
      upgrade: obj.upgrade,
      anticipatedPrereleases: obj.anticipatedPrereleases,
      previousSolution: obj.previousSolution
    });
};

// PackageConstraints and VersionConstraints passed in from the tool
// to us (where we are a uniloaded package) will have constructors
// that we don't recognize because they come from a different copy of
// package-version-parser!  In addition, objects with constructors
// can't be checked by "check" in the same way as plain objects, so we
// have to resort to examining the fields explicitly.
var VersionConstraintType = Match.OneOf(
  PV.VersionConstraint,
  Match.Where(function (vc) {
    check(vc.raw, String);
    check(vc.alternatives, [{
      versionString: Match.OneOf(String, null),
      type: String
    }]);
    return vc.constructor !== Object;
  }));

var PackageConstraintType = Match.OneOf(
  PV.PackageConstraint,
  Match.Where(function (c) {
    check(c.package, String);
    check(c.constraintString, String);
    check(c.versionConstraint, VersionConstraintType);
    return c.constructor !== Object;
  }));

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraint-solver.js                                                   //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var PV = PackageVersion;
var CS = ConstraintSolver;

// This is the entry point for the constraint-solver package.  The tool
// creates a ConstraintSolver.PackagesResolver and calls .resolve on it.

CS.PackagesResolver = function (catalog, options) {
  var self = this;

  self.catalog = catalog;
  self.catalogCache = new CS.CatalogCache();
  self.catalogLoader = new CS.CatalogLoader(self.catalog, self.catalogCache);

  self._options = {
    nudge: options && options.nudge
  };
};

// dependencies - an array of string names of packages (not slices)
// constraints - an array of PV.PackageConstraints
// options:
//  - upgrade - list of dependencies for which upgrade is prioritized higher
//    than keeping the old version
//  - previousSolution - mapping from package name to a version that was used in
//    the previous constraint solver run
//  - anticipatedPrereleases: mapping from package name to version to true;
//    included versions are the only pre-releases that are allowed to match
//    constraints that don't specifically name them during the "try not to
//    use unanticipated pre-releases" pass
CS.PackagesResolver.prototype.resolve = function (dependencies, constraints,
                                                  options) {
  var self = this;
  var input = new CS.Input(dependencies, constraints, self.catalogCache,
                           options);
  input.loadFromCatalog(self.catalogLoader);

  return CS.PackagesResolver._resolveWithInput(input, this._options.nudge);
};

// Exposed for tests.
CS.PackagesResolver._resolveWithInput = function (input, _nudge) {
  check(input, CS.Input);

  // Dump the input to the console!  XXX Put this behind a flag.
  //console.log(JSON.stringify(input.toJSONable(), null, 2));

  var resolver = new CS.Resolver({nudge: _nudge});

  // Set up the Resolver using the package versions in the cache.
  var cache = input.catalogCache;
  cache.eachPackage(function (p, versions) {
    versions = _.clone(versions).sort(PV.compare);
    _.each(versions, function (v) {
      var uv = new CS.UnitVersion(p, v);
      resolver.addUnitVersion(uv);
      _.each(cache.getDependencyMap(p, v), function (dep) {
        // `dep` is a CS.Dependency
        var p2 = dep.packageConstraint.package;
        var constr = dep.packageConstraint.constraintString;
        if (! dep.isWeak) {
          uv.addDependency(p2);
        }
        if (constr) {
          uv.addConstraint(resolver.getConstraint(p2, constr));
        }
      });
    });
  });

  var previousSolutionUVs = null;
  if (input.previousSolution) {
    // Build a list of the UnitVersions that we know about that were
    // mentioned in the previousSolution map.
    // (_.compact drops unknown UnitVersions.)
    previousSolutionUVs = _.compact(
      _.map(input.previousSolution, function (version, packageName) {
        return resolver.getUnitVersion(packageName, version);
      }));
  }

  // Convert upgrade to a map for O(1) access.
  var upgradePackages = {};
  _.each(input.upgrade, function (packageName) {
    upgradePackages[packageName] = true;
  });

  var constraints = _.map(input.constraints, function (c) {
    return resolver.getConstraint(c.package, c.constraintString);
  });

  var resolverOptions = {
    anticipatedPrereleases: input.anticipatedPrereleases
  };
  _.extend(resolverOptions,
           getCostFunction(resolver, {
             rootDependencies: input.dependencies,
             upgrade: upgradePackages,
             previousSolution: previousSolutionUVs
           }));

  var res = null;
  var neededToUseUnanticipatedPrereleases = false;

  // If a previous solution existed, try resolving with additional (weak)
  // equality constraints on all the versions from the previous solution (except
  // those we've explicitly been asked to update). If it's possible to solve the
  // constraints without changing any of the previous versions (though we may
  // add more choices in addition, or remove some now-unnecessary choices) then
  // that's our first try.
  //
  // If we're intentionally trying to upgrade some or all packages, we just skip
  // this step. We used to try to do this step but just leaving off pins from
  // the packages we're trying to upgrade, but this tended to not lead to actual
  // upgrades since we were still pinning things that the to-upgrade package
  // depended on.  (We still use the specific contents of options.upgrade to
  // guide which things are encouraged to be upgraded vs stay the same in the
  // heuristic.)
  if (!_.isEmpty(previousSolutionUVs) && _.isEmpty(upgradePackages)) {
    var constraintsWithPreviousSolutionLock = _.clone(constraints);
    _.each(previousSolutionUVs, function (uv) {
      constraintsWithPreviousSolutionLock.push(
        resolver.getConstraint(uv.name, '=' + uv.version));
    });
    try {
      // Try running the resolver. If it fails to resolve, that's OK, we'll keep
      // working.
      res = resolver.resolve(
        input.dependencies,
        constraintsWithPreviousSolutionLock, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  // Either we didn't have a previous solution, or it doesn't work. Try again
  // without locking in the previous solution as strict equality.
  if (!res) {
    try {
      res = resolver.resolve(input.dependencies, constraints, resolverOptions);
    } catch (e) {
      if (!(e.constraintSolverError))
        throw e;
    }
  }

  // As a last-ditch effort, let's allow ANY pre-release version found in the
  // catalog, not only those that are asked for at some level.
  if (!res) {
    resolverOptions.anticipatedPrereleases = true;
    neededToUseUnanticipatedPrereleases = true;
    // Unlike the previous calls, this one throws a constraintSolverError on
    // failure.
    res = resolver.resolve(input.dependencies, constraints, resolverOptions);
  }
  return {
    answer:  resolverResultToPackageMap(res),
    neededToUseUnanticipatedPrereleases: neededToUseUnanticipatedPrereleases
  };
};

var resolverResultToPackageMap = function (choices) {
  var packageMap = {};
  mori.each(choices, function (nameAndUv) {
    var name = mori.first(nameAndUv);
    var uv = mori.last(nameAndUv);
    packageMap[name] = uv.version;
  });
  return packageMap;
};

// Takes options {rootDependencies, previousSolution, upgrade}.
//
// Returns an object containing {costFunction, estimateCostFunction,
// combineCostFunction}.
var getCostFunction = function (resolver, options) {
  // Poorman's enum
  var VMAJOR = 0, MAJOR = 1, MEDIUM = 2, MINOR = 3;
  var rootDeps = options.rootDependencies || [];
  var prevSol = options.previousSolution || [];

  var isRootDep = {};
  var prevSolMapping = {};

  _.each(rootDeps, function (dep) { isRootDep[dep] = true; });

  // if the upgrade is preferred over preserving previous solution, pretend
  // there are no previous solution
  _.each(prevSol, function (uv) {
    if (! _.has(options.upgrade, uv.name))
      prevSolMapping[uv.name] = uv;
  });

  return {
    costFunction: function (state) {
      options = options || {};
      // very major, major, medium, minor costs
      // XXX maybe these can be calculated lazily?
      var cost = [0, 0, 0, 0];

      mori.each(state.choices, function (nameAndUv) {
        var uv = mori.last(nameAndUv);
        if (_.has(prevSolMapping, uv.name)) {
          // The package was present in the previous solution
          var prev = prevSolMapping[uv.name];
          var versionsDistance =
            PV.versionMagnitude(uv.version) -
            PV.versionMagnitude(prev.version);

          var isCompatible = prev.majorVersion === uv.majorVersion;

          if (isRootDep[uv.name]) {
            // root dependency
            if (versionsDistance < 0 || ! isCompatible) {
              // the new pick is older or is incompatible with the prev. solution
              // i.e. can have breaking changes, prefer not to do this
              // XXX in fact we want to avoid downgrades to the direct
              // dependencies at all cost.
              cost[VMAJOR]++;
            } else {
              // compatible but possibly newer
              // prefer the version closest to the older solution
              cost[MAJOR] += versionsDistance;
            }
          } else {
            // transitive dependency
            // prefer to have less changed transitive dependencies
            cost[MINOR] += versionsDistance === 0 ? 0 : 1;
          }
        } else {
          var latestDistance =
            PV.versionMagnitude(_.last(resolver.unitsVersions[uv.name]).version) -
            PV.versionMagnitude(uv.version);

          if (isRootDep[uv.name] || _.has(options.upgrade, uv.name)) {
            // preferably latest
            cost[MEDIUM] += latestDistance;
          } else {
            // transitive dependency
            // prefarable earliest possible to be conservative
            // How far is our choice from the most conservative version that
            // also matches our constraints?
            var minimal = state.constraints.getMinimalVersion(uv.name) || '0.0.0';
            cost[MINOR] += PV.versionMagnitude(uv.version) - PV.versionMagnitude(minimal);
          }
        }
      });

      return cost;
    },

    estimateCostFunction: function (state) {
      options = options || {};

      var cost = [0, 0, 0, 0];

      state.eachDependency(function (dep, alternatives) {
        // XXX don't try to estimate transitive dependencies
        if (! isRootDep[dep]) {
          cost[MINOR] += 10000000;
          return;
        }

        if (_.has(prevSolMapping, dep)) {
          var prev = prevSolMapping[dep];
          var prevVersionMatches = state.isSatisfied(prev);

          // if it matches, assume we would pick it and the cost doesn't
          // increase
          if (prevVersionMatches)
            return;

          // Get earliest matching version.
          var earliestMatching = mori.first(alternatives);

          var isCompatible =
                prev.majorVersion === earliestMatching.majorVersion;
          if (! isCompatible) {
            cost[VMAJOR]++;
            return;
          }

          var versionsDistance =
            PV.versionMagnitude(earliestMatching.version) -
            PV.versionMagnitude(prev.version);
          if (versionsDistance < 0) {
            cost[VMAJOR]++;
            return;
          }

          cost[MAJOR] += versionsDistance;
        } else {
          var versions = resolver.unitsVersions[dep];
          var latestMatching = mori.last(alternatives);

          var latestDistance =
            PV.versionMagnitude(
              _.last(resolver.unitsVersions[dep]).version) -
            PV.versionMagnitude(latestMatching.version);

          cost[MEDIUM] += latestDistance;
        }
      });

      return cost;
    },

    combineCostFunction: function (costA, costB) {
      if (costA.length !== costB.length)
        throw new Error("Different cost types");

      var arr = [];
      _.each(costA, function (l, i) {
        arr.push(l + costB[i]);
      });

      return arr;
    }
  };
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/resolver.js                                                            //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
mori = Npm.require('mori');

BREAK = {};  // used by our 'each' functions

////////////////////////////////////////////////////////////////////////////////
// Resolver
////////////////////////////////////////////////////////////////////////////////

// XXX the whole resolver heavily relies on these statements to be true:
// - every unit version ever used was added to the resolver with addUnitVersion
// - every constraint ever used was instantiated with getConstraint
// - every constraint was added exactly once
// - every unit version was added exactly once
// - if two unit versions are the same, their refs point at the same object
// - if two constraints are the same, their refs point at the same object
ConstraintSolver.Resolver = function (options) {
  var self = this;
  options = options || {};

  self._nudge = options.nudge;

  // Maps unit name string to a sorted array of version definitions
  self.unitsVersions = {};
  // Maps name@version string to a unit version
  self._unitsVersionsMap = {};

  // Refs to all constraints. Mapping String -> instance
  self._constraints = {};
};

ConstraintSolver.Resolver.prototype.addUnitVersion = function (unitVersion) {
  var self = this;

  check(unitVersion, ConstraintSolver.UnitVersion);

  if (_.has(self._unitsVersionsMap, unitVersion.toString())) {
    throw Error("duplicate uv " + unitVersion.toString() + "?");
  }

  if (! _.has(self.unitsVersions, unitVersion.name)) {
    self.unitsVersions[unitVersion.name] = [];
  } else {
    var latest = _.last(self.unitsVersions[unitVersion.name]).version;
    if (!PackageVersion.lessThan(latest, unitVersion.version)) {
      throw Error("adding uv out of order: " + latest + " vs "
                  + unitVersion.version);
    }
  }

  self.unitsVersions[unitVersion.name].push(unitVersion);
  self._unitsVersionsMap[unitVersion.toString()] = unitVersion;
};



ConstraintSolver.Resolver.prototype.getUnitVersion = function (unitName, version) {
  var self = this;
  return self._unitsVersionsMap[unitName + "@" + version];
};

// name - String - "someUnit"
// versionConstraint - String - "=1.2.3" or "2.1.0"
ConstraintSolver.Resolver.prototype.getConstraint =
  function (name, versionConstraint) {
  var self = this;

  check(name, String);
  check(versionConstraint, String);

  var idString = JSON.stringify([name, versionConstraint]);

  if (_.has(self._constraints, idString))
    return self._constraints[idString];

  return self._constraints[idString] =
    new ConstraintSolver.Constraint(name, versionConstraint);
};

// options: Object:
// - costFunction: function (state) - given a state evaluates its cost
// - estimateCostFunction: function (state) - given a state, evaluates the
// estimated cost of the best path from state to a final state
// - combineCostFunction: function (cost, cost) - given two costs (obtained by
// evaluating states with costFunction and estimateCostFunction)
ConstraintSolver.Resolver.prototype.resolve = function (
    dependencies, constraints, options) {
  var self = this;
  constraints = constraints || [];
  var choices = mori.hash_map();  // uv.name -> uv
  options = _.extend({
    costFunction: function (state) { return 0; },
    estimateCostFunction: function (state) {
      return 0;
    },
    combineCostFunction: function (cost, anotherCost) {
      return cost + anotherCost;
    },
    anticipatedPrereleases: {}
  }, options);

  var resolveContext = new ResolveContext(options.anticipatedPrereleases);

  // Mapping that assigns every package an integer priority. We compute this
  // dynamically and in the process of resolution we try to resolve packages
  // with higher priority first. This helps the resolver a lot because if some
  // package has a higher weight to the solution (like a direct dependency) or
  // is more likely to break our solution in the future than others, it would be
  // great to try out and evaluate all versions early in the decision tree.
  // XXX this could go on ResolveContext
  var resolutionPriority = {};

  var startState = new ResolverState(self, resolveContext);

  _.each(constraints, function (constraint) {
    startState = startState.addConstraint(constraint, mori.list());
  });

  _.each(dependencies, function (unitName) {
    startState = startState.addDependency(unitName, mori.list());
    // Direct dependencies start on higher priority
    resolutionPriority[unitName] = 100;
  });

  if (startState.success()) {
    return startState.choices;
  }

  if (startState.error) {
    throwConstraintSolverError(startState.error);
  }

  var pq = new PriorityQueue();
  var overallCostFunction = function (state) {
    return [
      options.combineCostFunction(
        options.costFunction(state),
        options.estimateCostFunction(state)),
      -mori.count(state.choices)
    ];
  };

  pq.push(startState, overallCostFunction(startState));

  var someError = null;
  var anySucceeded = false;
  while (! pq.empty()) {
    // Since we're in a CPU-bound loop, allow yielding or printing a message or
    // something.
    self._nudge && self._nudge();

    var currentState = pq.pop();

    if (currentState.success()) {
      return currentState.choices;
    }

    var neighborsObj = self._stateNeighbors(currentState, resolutionPriority);

    if (! neighborsObj.success) {
      someError = someError || neighborsObj.failureMsg;
      resolutionPriority[neighborsObj.conflictingUnit] =
        (resolutionPriority[neighborsObj.conflictingUnit] || 0) + 1;
    } else {
      _.each(neighborsObj.neighbors, function (state) {
        // We don't just return the first successful one we find, in case there
        // are multiple successful states (we want to sort by cost function in
        // that case).
        pq.push(state, overallCostFunction(state));
      });
    }
  }

  // XXX should be much much better
  if (someError) {
    throwConstraintSolverError(someError);
  }

  throw new Error("ran out of states without error?");
};

var throwConstraintSolverError = function (message) {
  var e = new Error(message);
  e.constraintSolverError = true;
  throw e;
};

// returns {
//   success: Boolean,
//   failureMsg: String,
//   neighbors: [state]
// }
ConstraintSolver.Resolver.prototype._stateNeighbors = function (
    state, resolutionPriority) {
  var self = this;

  var candidateName = null;
  var candidateVersions = null;
  var currentNaughtiness = -1;

  state.eachDependency(function (unitName, versions) {
    var r = resolutionPriority[unitName] || 0;
    if (r > currentNaughtiness) {
      currentNaughtiness = r;
      candidateName = unitName;
      candidateVersions = versions;
    }
  });

  if (mori.is_empty(candidateVersions))
    throw Error("empty candidate set? should have detected earlier");

  var pathway = state.somePathwayForUnitName(candidateName);

  var neighbors = [];
  var firstError = null;
  mori.each(candidateVersions, function (unitVersion) {
    var neighborState = state.addChoice(unitVersion, pathway);
    if (!neighborState.error) {
      neighbors.push(neighborState);
    } else if (!firstError) {
      firstError = neighborState.error;
    }
  });

  if (neighbors.length) {
    return { success: true, neighbors: neighbors };
  }
  return {
    success: false,
    failureMsg: firstError,
    conflictingUnit: candidateName
  };
};

////////////////////////////////////////////////////////////////////////////////
// UnitVersion
////////////////////////////////////////////////////////////////////////////////

ConstraintSolver.UnitVersion = function (name, unitVersion) {
  var self = this;

  check(name, String);
  check(unitVersion, String);
  check(self, ConstraintSolver.UnitVersion);

  self.name = name;
  // Things with different build IDs should represent the same code, so ignore
  // them. (Notably: depending on @=1.3.1 should allow 1.3.1+local!)
  // XXX we no longer automatically add build IDs to things as part of our build
  // process, but this still reflects semver semantics.
  self.version = PackageVersion.removeBuildID(unitVersion);
  self.dependencies = [];
  self.constraints = new ConstraintSolver.ConstraintsList();
  // integer like 1 or 2
  self.majorVersion = PackageVersion.majorVersion(unitVersion);
};

_.extend(ConstraintSolver.UnitVersion.prototype, {
  addDependency: function (name) {
    var self = this;

    check(name, String);
    if (_.contains(self.dependencies, name)) {
      return;
    }
    self.dependencies.push(name);
  },
  addConstraint: function (constraint) {
    var self = this;

    check(constraint, ConstraintSolver.Constraint);
    if (self.constraints.contains(constraint)) {
      return;
      // XXX may also throw if it is unexpected
      throw new Error("Constraint already exists -- " + constraint.toString());
    }

    self.constraints = self.constraints.push(constraint);
  },

  toString: function () {
    var self = this;
    return self.name + "@" + self.version;
  }
});

////////////////////////////////////////////////////////////////////////////////
// Constraint
////////////////////////////////////////////////////////////////////////////////

// Can be called either:
//    new PackageVersion.Constraint("packageA", "=2.1.0")
// or:
//    new PackageVersion.Constraint("pacakgeA@=2.1.0")
ConstraintSolver.Constraint = function (name, constraintString) {
  var self = this;

  var parsed = PackageVersion.parsePackageConstraint(name, constraintString);

  self.name = parsed.package;
  self.constraintString = parsed.constraintString;
  // The results of parsing are `||`-separated alternatives, simple
  // constraints like `1.0.0` or `=1.0.1` which have been parsed into
  // objects with a `type` and `versionString` property.
  self.alternatives = parsed.versionConstraint.alternatives;
};

ConstraintSolver.Constraint.prototype.toString = function (options) {
  var self = this;
  return self.name + "@" + self.constraintString;
};


ConstraintSolver.Constraint.prototype.isSatisfied = function (
  candidateUV, resolveContext) {
  var self = this;
  check(candidateUV, ConstraintSolver.UnitVersion);

  if (self.name !== candidateUV.name) {
    throw Error("asking constraint on " + self.name + " about " +
                candidateUV.name);
  }

  var prereleaseNeedingLicense = false;

  // We try not to allow "pre-release" versions (versions with a '-') unless
  // they are explicitly mentioned.  If the `anticipatedPrereleases` option is
  // `true` set, all pre-release versions are allowed.  Otherwise,
  // anticipatedPrereleases lists pre-release versions that are always allow
  // (this corresponds to pre-release versions mentioned explicitly in
  // *top-level* constraints).
  //
  // Otherwise, if `candidateUV` is a pre-release, it needs to be "licensed" by
  // being mentioned by name in *this* constraint or matched by an inexact
  // constraint whose version also has a '-'.
  //
  // Note that a constraint "@2.0.0" can never match a version "2.0.1-rc.1"
  // unless anticipatedPrereleases allows it, even if another constraint found
  // in the graph (but not at the top level) explicitly mentions "2.0.1-rc.1".
  // Why? The constraint solver assumes that adding a constraint to the resolver
  // state can't make previously impossible choices now possible.  If
  // pre-releases mentioned anywhere worked, then applying the constraint
  // "@2.0.0" followed by "@=2.0.1-rc.1" would result in "2.0.1-rc.1" ruled
  // first impossible and then possible again. That will break this algorith, so
  // we have to fix the meaning based on something known at the start of the
  // search.  (We could try to apply our prerelease-avoidance tactics solely in
  // the cost functions, but then it becomes a much less strict rule.)
  if (resolveContext.anticipatedPrereleases !== true
      && /-/.test(candidateUV.version)) {
    var isAnticipatedPrerelease = (
      _.has(resolveContext.anticipatedPrereleases, self.name) &&
        _.has(resolveContext.anticipatedPrereleases[self.name],
              candidateUV.version));
    if (! isAnticipatedPrerelease) {
      prereleaseNeedingLicense = true;
    }
  }

  return _.some(self.alternatives, function (simpleConstraint) {
    var type = simpleConstraint.type;

    if (type === "any-reasonable") {
      return ! prereleaseNeedingLicense;
    } else if (type === "exactly") {
      var version = simpleConstraint.versionString;
      return (version === candidateUV.version);
    } else if (type === 'compatible-with') {
      var version = simpleConstraint.versionString;

      if (prereleaseNeedingLicense && ! /-/.test(version)) {
        return false;
      }

      // If the candidate version is less than the version named in the
      // constraint, we are not satisfied.
      if (PackageVersion.lessThan(candidateUV.version, version)) {
        return false;
      }

      // To be compatible, the two versions must have the same major version
      // number.
      if (candidateUV.majorVersion !== PackageVersion.majorVersion(version)) {
        return false;
      }

      return true;
    } else {
      throw Error("Unknown constraint type: " + type);
    }
  });
};

// An object that records the general context of a resolve call. It can be
// different for different resolve calls on the same Resolver, but is the same
// for every ResolverState in a given call.
var ResolveContext = function (anticipatedPrereleases) {
  var self = this;
  // EITHER: "true", in which case all prereleases are anticipated, or a map
  //         unitName -> version string -> true
  self.anticipatedPrereleases = anticipatedPrereleases;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/constraints-list.js                                                    //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
////////////////////////////////////////////////////////////////////////////////
// ConstraintsList
////////////////////////////////////////////////////////////////////////////////
// A persistent data-structure that keeps references to Constraint objects
// arranged by the "name" field of Constraint and exactness of the constraint.
//
// Internal structure has two maps, 'exact' and 'inexact'; they each map
// unit name -> mori.set(Constraint).  (This relies on the fact that Constraints
// are interned, so that mori.set can use reference identity.)
//
// We separate the constraints by exactness so that the iteration functions
// (forPackage and each) can easily provide exact constraints before inexact
// constraints, because exact constraints generally help the consumer pare down
// their possibilities faster.
// XXX This is just a theory, and it's not clear that we have benchmarks that
//     prove it.
ConstraintSolver.ConstraintsList = function (prev) {
  var self = this;

  if (prev) {
    self.exact = prev.exact;
    self.inexact = prev.inexact;
    self.minimalVersion = prev.minimalVersion;
  } else {
    self.exact = mori.hash_map();
    self.inexact = mori.hash_map();
    self.minimalVersion = mori.hash_map();
  }
};

ConstraintSolver.ConstraintsList.prototype.contains = function (c) {
  var self = this;
  var map = c.type === 'exactly' ? self.exact : self.inexact;
  return !!mori.get_in(map, [c.name, c]);
};

ConstraintSolver.ConstraintsList.prototype.getMinimalVersion = function (name) {
  var self = this;
  return mori.get(self.minimalVersion, name);
};

// returns a new version containing passed constraint
ConstraintSolver.ConstraintsList.prototype.push = function (c) {
  var self = this;

  if (self.contains(c)) {
    return self;
  }

  var newList = new ConstraintSolver.ConstraintsList(self);
  var mapField = c.type === 'exactly' ? 'exact' : 'inexact';
  // Get the current constraints on this package of the exactness, or an empty
  // set.
  var currentConstraints = mori.get(newList[mapField], c.name, mori.set());
  // Add this one.
  newList[mapField] = mori.assoc(newList[mapField],
                                 c.name,
                                 mori.conj(currentConstraints, c));

  // Maintain the "minimal version" that can satisfy these constraints.
  // Note that this is one of the only pieces of the constraint solver that
  // actually does logic on constraints (and thus relies on the restricted set
  // of constraints that we support).
  if (c.type !== 'any-reasonable') {
    var minimal = mori.get(newList.minimalVersion, c.name);
    if (!minimal || PackageVersion.lessThan(c.version, minimal)) {
      newList.minimalVersion = mori.assoc(
        newList.minimalVersion, c.name, c.version);
    }
  }
  return newList;
};

ConstraintSolver.ConstraintsList.prototype.forPackage = function (name, iter) {
  var self = this;
  var exact = mori.get(self.exact, name);
  var inexact = mori.get(self.inexact, name);

  var breaked = false;
  var niter = function (constraint) {
    if (iter(constraint) === BREAK) {
      breaked = true;
      return true;
    }
  };

  exact && mori.some(niter, exact);
  if (breaked)
    return;
  inexact && mori.some(niter, inexact);
};

// doesn't break on the false return value
ConstraintSolver.ConstraintsList.prototype.each = function (iter) {
  var self = this;
  _.each([self.exact, self.inexact], function (map) {
    mori.each(map, function (nameAndConstraints) {
      mori.each(mori.last(nameAndConstraints), iter);
    });
  });
};

// Checks if the passed unit version satisfies all of the constraints.
ConstraintSolver.ConstraintsList.prototype.isSatisfied = function (
    uv, resolveContext) {
  var self = this;

  var satisfied = true;

  self.forPackage(uv.name, function (c) {
    if (! c.isSatisfied(uv, resolveContext)) {
      satisfied = false;
      return BREAK;
    }
  });

  return satisfied;
};

ConstraintSolver.ConstraintsList.prototype.toString = function () {
  var self = this;

  var strs = [];

  self.each(function (c) {
    strs.push(c.toString());
  });

  strs = _.uniq(strs);

  return "<constraints list: " + strs.join(", ") + ">";
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/resolver-state.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
var util = Npm.require('util');

ResolverState = function (resolver, resolveContext) {
  var self = this;
  self._resolver = resolver;
  self._resolveContext = resolveContext;
  // The versions we've already chosen.
  // unitName -> UnitVersion
  self.choices = mori.hash_map();
  // Units we need, but haven't chosen yet.
  // unitName -> sorted vector of (UnitVersions)
  self._dependencies = mori.hash_map();
  // Constraints that apply.
  self.constraints = new ConstraintSolver.ConstraintsList;
  // How we've decided things about units.
  // unitName -> set(list (reversed) of UVs that led us here).
  self._unitPathways = mori.hash_map();
  // If we've already hit a contradiction.
  self.error = null;
};

_.extend(ResolverState.prototype, {
  addConstraint: function (constraint, pathway) {
    var self = this;
    if (self.error)
      return self;

    // Add the constraint.
    var newConstraints = self.constraints.push(constraint);
    // If we already had the constraint, we're done.
    if (self.constraints === newConstraints)
      return self;

    self = self._clone();
    self.constraints = newConstraints;
    self._addPathway(constraint.name, pathway);

    var chosen = mori.get(self.choices, constraint.name);
    if (chosen &&
        !constraint.isSatisfied(chosen, self._resolveContext)) {
      // This constraint conflicts with a choice we've already made!
      self.error = util.format(
        "conflict: constraint %s is not satisfied by %s.\n" +
        "Constraints on %s come from:\n%s",
        constraint.toString(),
        chosen.version,
        constraint.name,
        self._shownPathwaysForConstraintsIndented(constraint.name));
      return self;
    }

    var alternatives = mori.get(self._dependencies, constraint.name);
    if (alternatives) {
      // Note: filter preserves order, which is important.
      var newAlternatives = filter(alternatives, function (unitVersion) {
        return constraint.isSatisfied(unitVersion, self._resolveContext);
      });
      if (mori.is_empty(newAlternatives)) {
        self.error = util.format(
          "conflict: constraints on %s cannot all be satisfied.\n" +
            "Constraints come from:\n%s",
          constraint.name,
          self._shownPathwaysForConstraintsIndented(constraint.name));
      } else if (mori.count(newAlternatives) === 1) {
        // There's only one choice, so we can immediately choose it.
        self = self.addChoice(mori.first(newAlternatives), pathway);
      } else if (mori.count(newAlternatives) !== mori.count(alternatives)) {
        self._dependencies = mori.assoc(
          self._dependencies, constraint.name, newAlternatives);
      }
    }
    return self;
  },
  addDependency: function (unitName, pathway) {
    var self = this;

    if (self.error || mori.has_key(self.choices, unitName)
        || mori.has_key(self._dependencies, unitName)) {
      return self;
    }

    self = self._clone();

    if (!_.has(self._resolver.unitsVersions, unitName)) {
      self.error = "unknown package: " + unitName;
      return self;
    }

    // Note: relying on sortedness of unitsVersions so that alternatives is
    // sorted too (the estimation function uses this).
    var alternatives = filter(self._resolver.unitsVersions[unitName], function (uv) {
      return self.isSatisfied(uv);
      // XXX hang on to list of violated constraints and use it in error
      // message
    });

    if (mori.is_empty(alternatives)) {
      self.error = util.format(
        "conflict: constraints on %s cannot be satisfied.\n" +
          "Constraints come from:\n%s",
        unitName,
        self._shownPathwaysForConstraintsIndented(unitName));
      return self;
    } else if (mori.count(alternatives) === 1) {
      // There's only one choice, so we can immediately choose it.
      self = self.addChoice(mori.first(alternatives), pathway);
    } else {
      self._dependencies = mori.assoc(
        self._dependencies, unitName, alternatives);
      self._addPathway(unitName, pathway);
    }

    return self;
  },
  addChoice: function (uv, pathway) {
    var self = this;

    if (self.error)
      return self;
    if (mori.has_key(self.choices, uv.name))
      throw Error("Already chose " + uv.name);

    self = self._clone();

    // Does adding this choice break some constraints we already have?
    if (!self.isSatisfied(uv)) {
      // This shouldn't happen: all calls to addChoice should occur based on
      // choosing it from a list of satisfied alternatives.
      throw new Error("try to choose an unsatisfied version?");
    }

    // Great, move it from dependencies to choices.
    self.choices = mori.assoc(self.choices, uv.name, uv);
    self._dependencies = mori.dissoc(self._dependencies, uv.name);
    self._addPathway(uv.name, pathway);

    // Since we're committing to this version, we're committing to all it
    // implies.
    var pathwayIncludingUv = mori.cons(uv, pathway);
    uv.constraints.each(function (constraint) {
      self = self.addConstraint(constraint, pathwayIncludingUv);
    });
    _.each(uv.dependencies, function (unitName) {
      self = self.addDependency(unitName, pathwayIncludingUv);
    });

    return self;
  },
  // this mutates self, so only call on a newly _clone'd and not yet returned
  // object.
  _addPathway: function (unitName, pathway) {
    var self = this;
    self._unitPathways = mori.assoc(
      self._unitPathways, unitName,
      mori.conj(mori.get(self._unitPathways, unitName, mori.set()),
                pathway));
  },
  success: function () {
    var self = this;
    return !self.error && mori.is_empty(self._dependencies);
  },
  eachDependency: function (iter) {
    var self = this;
    mori.some(function (nameAndAlternatives) {
      return BREAK == iter(mori.first(nameAndAlternatives),
                           mori.last(nameAndAlternatives));
    }, self._dependencies);
  },
  isSatisfied: function (uv) {
    var self = this;
    return self.constraints.isSatisfied(uv, self._resolveContext);
  },
  somePathwayForUnitName: function (unitName) {
    var self = this;
    var pathways = mori.get(self._unitPathways, unitName);
    if (!pathways)
      return mori.list();
    return mori.first(pathways);
  },
  _clone: function () {
    var self = this;
    var clone = new ResolverState(self._resolver, self._resolveContext);
    _.each(['choices', '_dependencies', 'constraints', 'error', '_unitPathways'], function (field) {
      clone[field] = self[field];
    });
    return clone;
  },
  _shownPathwaysForConstraints: function (unitName) {
    var self = this;
    var pathways = mori.into_array(mori.map(function (pathway) {
      return showPathway(pathway, unitName);
    }, mori.get(self._unitPathways, unitName)));
    pathways.sort();
    pathways = _.uniq(pathways, true);
    return pathways;
  },
  _shownPathwaysForConstraintsIndented: function (unitName) {
    var self = this;
    return _.map(self._shownPathwaysForConstraints(unitName), function (pathway) {
      return "  " + (pathway ? pathway : "<top level>");
    }).join("\n");
  }
});

// Helper for filtering a vector in mori. mori.filter returns a lazy sequence,
// which is cool, but we actually do want to coerce to a vector since we (eg the
// estimation function) runs mori.last on it a bunch and we'd like to only
// do the O(n) work once.
var filter = function (v, pred) {
  return mori.into(mori.vector(), mori.filter(pred, v));
};

// XXX from Underscore.String (http://epeli.github.com/underscore.string/)
// XXX how many copies of this do we have in Meteor?
var startsWith = function(str, starts) {
  return str.length >= starts.length &&
    str.substring(0, starts.length) === starts;
};

var showPathway = function (pathway, dropIfFinal) {
  var pathUnits = mori.into_array(mori.map(function (uv) {
    return uv.toString();
  }, mori.reverse(pathway)));

  var dropPrefix = dropIfFinal + '@';
  while (pathUnits.length && startsWith(_.last(pathUnits), dropPrefix)) {
    pathUnits.pop();
  }

  return pathUnits.join(' -> ');
};

///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

///////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                                   //
// packages/constraint-solver/priority-queue.js                                                      //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                                     //
PriorityQueue = function () {
  var self = this;
  var compareArrays = function (a, b) {
    for (var i = 0; i < a.length; i++)
      if (a[i] !== b[i])
        if (a[i] instanceof Array)
          return compareArrays(a[i], b[i]);
        else
          return a[i] - b[i];

    return 0;
  };
  // id -> cost
  self._heap = new MinHeap(function (a, b) {
    return compareArrays(a, b);
  });

  // id -> reference to item
  self._items = {};
};

_.extend(PriorityQueue.prototype, {
  push: function (item, cost) {
    var self = this;
    var id = Random.id();
    self._heap.set(id, cost);
    self._items[id] = item;
  },
  top: function () {
    var self = this;

    if (self.empty())
      throw new Error("The queue is empty");

    var id = self._heap.minElementId();
    return self._items[id];
  },
  pop: function () {
    var self = this;

    if (self.empty())
      throw new Error("The queue is empty");

    var id = self._heap.minElementId();
    var item = self._items[id];

    delete self._items[id];
    self._heap.remove(id);

    return item;
  },
  empty: function () {
    var self = this;
    return self._heap.empty();
  },
  size: function () {
    var self = this;
    return self._heap.size();
  }
});



///////////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);


/* Exports */
if (typeof Package === 'undefined') Package = {};
Package['constraint-solver'] = {
  ConstraintSolver: ConstraintSolver
};

})();

//# sourceMappingURL=constraint-solver.js.map
