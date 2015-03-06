(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/test-in-browser/diff_match_patch_uncompressed.js                                  //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
/**                                                                                           // 1
 * Diff Match and Patch                                                                       // 2
 *                                                                                            // 3
 * Copyright 2006 Google Inc.                                                                 // 4
 * http://code.google.com/p/google-diff-match-patch/                                          // 5
 *                                                                                            // 6
 * Licensed under the Apache License, Version 2.0 (the "License");                            // 7
 * you may not use this file except in compliance with the License.                           // 8
 * You may obtain a copy of the License at                                                    // 9
 *                                                                                            // 10
 *   http://www.apache.org/licenses/LICENSE-2.0                                               // 11
 *                                                                                            // 12
 * Unless required by applicable law or agreed to in writing, software                        // 13
 * distributed under the License is distributed on an "AS IS" BASIS,                          // 14
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.                   // 15
 * See the License for the specific language governing permissions and                        // 16
 * limitations under the License.                                                             // 17
 */                                                                                           // 18
                                                                                              // 19
/**                                                                                           // 20
 * @fileoverview Computes the difference between two texts to create a patch.                 // 21
 * Applies the patch onto another text, allowing for errors.                                  // 22
 * @author fraser@google.com (Neil Fraser)                                                    // 23
 */                                                                                           // 24
                                                                                              // 25
/**                                                                                           // 26
 * Class containing the diff, match and patch methods.                                        // 27
 * @constructor                                                                               // 28
 */                                                                                           // 29
function diff_match_patch() {                                                                 // 30
                                                                                              // 31
  // Defaults.                                                                                // 32
  // Redefine these in your program to override the defaults.                                 // 33
                                                                                              // 34
  // Number of seconds to map a diff before giving up (0 for infinity).                       // 35
  this.Diff_Timeout = 1.0;                                                                    // 36
  // Cost of an empty edit operation in terms of edit characters.                             // 37
  this.Diff_EditCost = 4;                                                                     // 38
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose).                 // 39
  this.Match_Threshold = 0.5;                                                                 // 40
  // How far to search for a match (0 = exact location, 1000+ = broad match).                 // 41
  // A match this many characters away from the expected location will add                    // 42
  // 1.0 to the score (0.0 is a perfect match).                                               // 43
  this.Match_Distance = 1000;                                                                 // 44
  // When deleting a large block of text (over ~64 characters), how close do                  // 45
  // the contents have to be to match the expected contents. (0.0 = perfection,               // 46
  // 1.0 = very loose).  Note that Match_Threshold controls how closely the                   // 47
  // end points of a delete need to match.                                                    // 48
  this.Patch_DeleteThreshold = 0.5;                                                           // 49
  // Chunk size for context length.                                                           // 50
  this.Patch_Margin = 4;                                                                      // 51
                                                                                              // 52
  // The number of bits in an int.                                                            // 53
  this.Match_MaxBits = 32;                                                                    // 54
}                                                                                             // 55
                                                                                              // 56
                                                                                              // 57
//  DIFF FUNCTIONS                                                                            // 58
                                                                                              // 59
                                                                                              // 60
/**                                                                                           // 61
 * The data structure representing a diff is an array of tuples:                              // 62
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]                // 63
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'                              // 64
 */                                                                                           // 65
var DIFF_DELETE = -1;                                                                         // 66
var DIFF_INSERT = 1;                                                                          // 67
var DIFF_EQUAL = 0;                                                                           // 68
                                                                                              // 69
/** @typedef {{0: number, 1: string}} */                                                      // 70
diff_match_patch.Diff;                                                                        // 71
                                                                                              // 72
                                                                                              // 73
/**                                                                                           // 74
 * Find the differences between two texts.  Simplifies the problem by stripping               // 75
 * any common prefix or suffix off the texts before diffing.                                  // 76
 * @param {string} text1 Old string to be diffed.                                             // 77
 * @param {string} text2 New string to be diffed.                                             // 78
 * @param {boolean=} opt_checklines Optional speedup flag. If present and false,              // 79
 *     then don't run a line-level diff first to identify the changed areas.                  // 80
 *     Defaults to true, which does a faster, slightly less optimal diff.                     // 81
 * @param {number} opt_deadline Optional time when the diff should be complete                // 82
 *     by.  Used internally for recursive calls.  Users should set DiffTimeout                // 83
 *     instead.                                                                               // 84
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 85
 */                                                                                           // 86
diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines,                 // 87
    opt_deadline) {                                                                           // 88
  // Set a deadline by which time the diff must be complete.                                  // 89
  if (typeof opt_deadline == 'undefined') {                                                   // 90
    if (this.Diff_Timeout <= 0) {                                                             // 91
      opt_deadline = Number.MAX_VALUE;                                                        // 92
    } else {                                                                                  // 93
      opt_deadline = (new Date).getTime() + this.Diff_Timeout * 1000;                         // 94
    }                                                                                         // 95
  }                                                                                           // 96
  var deadline = opt_deadline;                                                                // 97
                                                                                              // 98
  // Check for null inputs.                                                                   // 99
  if (text1 == null || text2 == null) {                                                       // 100
    throw new Error('Null input. (diff_main)');                                               // 101
  }                                                                                           // 102
                                                                                              // 103
  // Check for equality (speedup).                                                            // 104
  if (text1 == text2) {                                                                       // 105
    if (text1) {                                                                              // 106
      return [[DIFF_EQUAL, text1]];                                                           // 107
    }                                                                                         // 108
    return [];                                                                                // 109
  }                                                                                           // 110
                                                                                              // 111
  if (typeof opt_checklines == 'undefined') {                                                 // 112
    opt_checklines = true;                                                                    // 113
  }                                                                                           // 114
  var checklines = opt_checklines;                                                            // 115
                                                                                              // 116
  // Trim off common prefix (speedup).                                                        // 117
  var commonlength = this.diff_commonPrefix(text1, text2);                                    // 118
  var commonprefix = text1.substring(0, commonlength);                                        // 119
  text1 = text1.substring(commonlength);                                                      // 120
  text2 = text2.substring(commonlength);                                                      // 121
                                                                                              // 122
  // Trim off common suffix (speedup).                                                        // 123
  commonlength = this.diff_commonSuffix(text1, text2);                                        // 124
  var commonsuffix = text1.substring(text1.length - commonlength);                            // 125
  text1 = text1.substring(0, text1.length - commonlength);                                    // 126
  text2 = text2.substring(0, text2.length - commonlength);                                    // 127
                                                                                              // 128
  // Compute the diff on the middle block.                                                    // 129
  var diffs = this.diff_compute_(text1, text2, checklines, deadline);                         // 130
                                                                                              // 131
  // Restore the prefix and suffix.                                                           // 132
  if (commonprefix) {                                                                         // 133
    diffs.unshift([DIFF_EQUAL, commonprefix]);                                                // 134
  }                                                                                           // 135
  if (commonsuffix) {                                                                         // 136
    diffs.push([DIFF_EQUAL, commonsuffix]);                                                   // 137
  }                                                                                           // 138
  this.diff_cleanupMerge(diffs);                                                              // 139
  return diffs;                                                                               // 140
};                                                                                            // 141
                                                                                              // 142
                                                                                              // 143
/**                                                                                           // 144
 * Find the differences between two texts.  Assumes that the texts do not                     // 145
 * have any common prefix or suffix.                                                          // 146
 * @param {string} text1 Old string to be diffed.                                             // 147
 * @param {string} text2 New string to be diffed.                                             // 148
 * @param {boolean} checklines Speedup flag.  If false, then don't run a                      // 149
 *     line-level diff first to identify the changed areas.                                   // 150
 *     If true, then run a faster, slightly less optimal diff.                                // 151
 * @param {number} deadline Time when the diff should be complete by.                         // 152
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 153
 * @private                                                                                   // 154
 */                                                                                           // 155
diff_match_patch.prototype.diff_compute_ = function(text1, text2, checklines,                 // 156
    deadline) {                                                                               // 157
  var diffs;                                                                                  // 158
                                                                                              // 159
  if (!text1) {                                                                               // 160
    // Just add some text (speedup).                                                          // 161
    return [[DIFF_INSERT, text2]];                                                            // 162
  }                                                                                           // 163
                                                                                              // 164
  if (!text2) {                                                                               // 165
    // Just delete some text (speedup).                                                       // 166
    return [[DIFF_DELETE, text1]];                                                            // 167
  }                                                                                           // 168
                                                                                              // 169
  var longtext = text1.length > text2.length ? text1 : text2;                                 // 170
  var shorttext = text1.length > text2.length ? text2 : text1;                                // 171
  var i = longtext.indexOf(shorttext);                                                        // 172
  if (i != -1) {                                                                              // 173
    // Shorter text is inside the longer text (speedup).                                      // 174
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],                                         // 175
             [DIFF_EQUAL, shorttext],                                                         // 176
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];                        // 177
    // Swap insertions for deletions if diff is reversed.                                     // 178
    if (text1.length > text2.length) {                                                        // 179
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;                                                // 180
    }                                                                                         // 181
    return diffs;                                                                             // 182
  }                                                                                           // 183
                                                                                              // 184
  if (shorttext.length == 1) {                                                                // 185
    // Single character string.                                                               // 186
    // After the previous speedup, the character can't be an equality.                        // 187
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];                                      // 188
  }                                                                                           // 189
                                                                                              // 190
  // Check to see if the problem can be split in two.                                         // 191
  var hm = this.diff_halfMatch_(text1, text2);                                                // 192
  if (hm) {                                                                                   // 193
    // A half-match was found, sort out the return data.                                      // 194
    var text1_a = hm[0];                                                                      // 195
    var text1_b = hm[1];                                                                      // 196
    var text2_a = hm[2];                                                                      // 197
    var text2_b = hm[3];                                                                      // 198
    var mid_common = hm[4];                                                                   // 199
    // Send both pairs off for separate processing.                                           // 200
    var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);                     // 201
    var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);                     // 202
    // Merge the results.                                                                     // 203
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);                               // 204
  }                                                                                           // 205
                                                                                              // 206
  if (checklines && text1.length > 100 && text2.length > 100) {                               // 207
    return this.diff_lineMode_(text1, text2, deadline);                                       // 208
  }                                                                                           // 209
                                                                                              // 210
  return this.diff_bisect_(text1, text2, deadline);                                           // 211
};                                                                                            // 212
                                                                                              // 213
                                                                                              // 214
/**                                                                                           // 215
 * Do a quick line-level diff on both strings, then rediff the parts for                      // 216
 * greater accuracy.                                                                          // 217
 * This speedup can produce non-minimal diffs.                                                // 218
 * @param {string} text1 Old string to be diffed.                                             // 219
 * @param {string} text2 New string to be diffed.                                             // 220
 * @param {number} deadline Time when the diff should be complete by.                         // 221
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 222
 * @private                                                                                   // 223
 */                                                                                           // 224
diff_match_patch.prototype.diff_lineMode_ = function(text1, text2, deadline) {                // 225
  // Scan the text on a line-by-line basis first.                                             // 226
  var a = this.diff_linesToChars_(text1, text2);                                              // 227
  text1 = a.chars1;                                                                           // 228
  text2 = a.chars2;                                                                           // 229
  var linearray = a.lineArray;                                                                // 230
                                                                                              // 231
  var diffs = this.diff_main(text1, text2, false, deadline);                                  // 232
                                                                                              // 233
  // Convert the diff back to original text.                                                  // 234
  this.diff_charsToLines_(diffs, linearray);                                                  // 235
  // Eliminate freak matches (e.g. blank lines)                                               // 236
  this.diff_cleanupSemantic(diffs);                                                           // 237
                                                                                              // 238
  // Rediff any replacement blocks, this time character-by-character.                         // 239
  // Add a dummy entry at the end.                                                            // 240
  diffs.push([DIFF_EQUAL, '']);                                                               // 241
  var pointer = 0;                                                                            // 242
  var count_delete = 0;                                                                       // 243
  var count_insert = 0;                                                                       // 244
  var text_delete = '';                                                                       // 245
  var text_insert = '';                                                                       // 246
  while (pointer < diffs.length) {                                                            // 247
    switch (diffs[pointer][0]) {                                                              // 248
      case DIFF_INSERT:                                                                       // 249
        count_insert++;                                                                       // 250
        text_insert += diffs[pointer][1];                                                     // 251
        break;                                                                                // 252
      case DIFF_DELETE:                                                                       // 253
        count_delete++;                                                                       // 254
        text_delete += diffs[pointer][1];                                                     // 255
        break;                                                                                // 256
      case DIFF_EQUAL:                                                                        // 257
        // Upon reaching an equality, check for prior redundancies.                           // 258
        if (count_delete >= 1 && count_insert >= 1) {                                         // 259
          // Delete the offending records and add the merged ones.                            // 260
          diffs.splice(pointer - count_delete - count_insert,                                 // 261
                       count_delete + count_insert);                                          // 262
          pointer = pointer - count_delete - count_insert;                                    // 263
          var a = this.diff_main(text_delete, text_insert, false, deadline);                  // 264
          for (var j = a.length - 1; j >= 0; j--) {                                           // 265
            diffs.splice(pointer, 0, a[j]);                                                   // 266
          }                                                                                   // 267
          pointer = pointer + a.length;                                                       // 268
        }                                                                                     // 269
        count_insert = 0;                                                                     // 270
        count_delete = 0;                                                                     // 271
        text_delete = '';                                                                     // 272
        text_insert = '';                                                                     // 273
        break;                                                                                // 274
    }                                                                                         // 275
    pointer++;                                                                                // 276
  }                                                                                           // 277
  diffs.pop();  // Remove the dummy entry at the end.                                         // 278
                                                                                              // 279
  return diffs;                                                                               // 280
};                                                                                            // 281
                                                                                              // 282
                                                                                              // 283
/**                                                                                           // 284
 * Find the 'middle snake' of a diff, split the problem in two                                // 285
 * and return the recursively constructed diff.                                               // 286
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.                    // 287
 * @param {string} text1 Old string to be diffed.                                             // 288
 * @param {string} text2 New string to be diffed.                                             // 289
 * @param {number} deadline Time at which to bail if not yet complete.                        // 290
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 291
 * @private                                                                                   // 292
 */                                                                                           // 293
diff_match_patch.prototype.diff_bisect_ = function(text1, text2, deadline) {                  // 294
  // Cache the text lengths to prevent multiple calls.                                        // 295
  var text1_length = text1.length;                                                            // 296
  var text2_length = text2.length;                                                            // 297
  var max_d = Math.ceil((text1_length + text2_length) / 2);                                   // 298
  var v_offset = max_d;                                                                       // 299
  var v_length = 2 * max_d;                                                                   // 300
  var v1 = new Array(v_length);                                                               // 301
  var v2 = new Array(v_length);                                                               // 302
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing                     // 303
  // integers and undefined.                                                                  // 304
  for (var x = 0; x < v_length; x++) {                                                        // 305
    v1[x] = -1;                                                                               // 306
    v2[x] = -1;                                                                               // 307
  }                                                                                           // 308
  v1[v_offset + 1] = 0;                                                                       // 309
  v2[v_offset + 1] = 0;                                                                       // 310
  var delta = text1_length - text2_length;                                                    // 311
  // If the total number of characters is odd, then the front path will collide               // 312
  // with the reverse path.                                                                   // 313
  var front = (delta % 2 != 0);                                                               // 314
  // Offsets for start and end of k loop.                                                     // 315
  // Prevents mapping of space beyond the grid.                                               // 316
  var k1start = 0;                                                                            // 317
  var k1end = 0;                                                                              // 318
  var k2start = 0;                                                                            // 319
  var k2end = 0;                                                                              // 320
  for (var d = 0; d < max_d; d++) {                                                           // 321
    // Bail out if deadline is reached.                                                       // 322
    if ((new Date()).getTime() > deadline) {                                                  // 323
      break;                                                                                  // 324
    }                                                                                         // 325
                                                                                              // 326
    // Walk the front path one step.                                                          // 327
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {                                   // 328
      var k1_offset = v_offset + k1;                                                          // 329
      var x1;                                                                                 // 330
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {                   // 331
        x1 = v1[k1_offset + 1];                                                               // 332
      } else {                                                                                // 333
        x1 = v1[k1_offset - 1] + 1;                                                           // 334
      }                                                                                       // 335
      var y1 = x1 - k1;                                                                       // 336
      while (x1 < text1_length && y1 < text2_length &&                                        // 337
             text1.charAt(x1) == text2.charAt(y1)) {                                          // 338
        x1++;                                                                                 // 339
        y1++;                                                                                 // 340
      }                                                                                       // 341
      v1[k1_offset] = x1;                                                                     // 342
      if (x1 > text1_length) {                                                                // 343
        // Ran off the right of the graph.                                                    // 344
        k1end += 2;                                                                           // 345
      } else if (y1 > text2_length) {                                                         // 346
        // Ran off the bottom of the graph.                                                   // 347
        k1start += 2;                                                                         // 348
      } else if (front) {                                                                     // 349
        var k2_offset = v_offset + delta - k1;                                                // 350
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {                  // 351
          // Mirror x2 onto top-left coordinate system.                                       // 352
          var x2 = text1_length - v2[k2_offset];                                              // 353
          if (x1 >= x2) {                                                                     // 354
            // Overlap detected.                                                              // 355
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);                    // 356
          }                                                                                   // 357
        }                                                                                     // 358
      }                                                                                       // 359
    }                                                                                         // 360
                                                                                              // 361
    // Walk the reverse path one step.                                                        // 362
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {                                   // 363
      var k2_offset = v_offset + k2;                                                          // 364
      var x2;                                                                                 // 365
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {                   // 366
        x2 = v2[k2_offset + 1];                                                               // 367
      } else {                                                                                // 368
        x2 = v2[k2_offset - 1] + 1;                                                           // 369
      }                                                                                       // 370
      var y2 = x2 - k2;                                                                       // 371
      while (x2 < text1_length && y2 < text2_length &&                                        // 372
             text1.charAt(text1_length - x2 - 1) ==                                           // 373
             text2.charAt(text2_length - y2 - 1)) {                                           // 374
        x2++;                                                                                 // 375
        y2++;                                                                                 // 376
      }                                                                                       // 377
      v2[k2_offset] = x2;                                                                     // 378
      if (x2 > text1_length) {                                                                // 379
        // Ran off the left of the graph.                                                     // 380
        k2end += 2;                                                                           // 381
      } else if (y2 > text2_length) {                                                         // 382
        // Ran off the top of the graph.                                                      // 383
        k2start += 2;                                                                         // 384
      } else if (!front) {                                                                    // 385
        var k1_offset = v_offset + delta - k2;                                                // 386
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {                  // 387
          var x1 = v1[k1_offset];                                                             // 388
          var y1 = v_offset + x1 - k1_offset;                                                 // 389
          // Mirror x2 onto top-left coordinate system.                                       // 390
          x2 = text1_length - x2;                                                             // 391
          if (x1 >= x2) {                                                                     // 392
            // Overlap detected.                                                              // 393
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);                    // 394
          }                                                                                   // 395
        }                                                                                     // 396
      }                                                                                       // 397
    }                                                                                         // 398
  }                                                                                           // 399
  // Diff took too long and hit the deadline or                                               // 400
  // number of diffs equals number of characters, no commonality at all.                      // 401
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];                                        // 402
};                                                                                            // 403
                                                                                              // 404
                                                                                              // 405
/**                                                                                           // 406
 * Given the location of the 'middle snake', split the diff in two parts                      // 407
 * and recurse.                                                                               // 408
 * @param {string} text1 Old string to be diffed.                                             // 409
 * @param {string} text2 New string to be diffed.                                             // 410
 * @param {number} x Index of split point in text1.                                           // 411
 * @param {number} y Index of split point in text2.                                           // 412
 * @param {number} deadline Time at which to bail if not yet complete.                        // 413
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 414
 * @private                                                                                   // 415
 */                                                                                           // 416
diff_match_patch.prototype.diff_bisectSplit_ = function(text1, text2, x, y,                   // 417
    deadline) {                                                                               // 418
  var text1a = text1.substring(0, x);                                                         // 419
  var text2a = text2.substring(0, y);                                                         // 420
  var text1b = text1.substring(x);                                                            // 421
  var text2b = text2.substring(y);                                                            // 422
                                                                                              // 423
  // Compute both diffs serially.                                                             // 424
  var diffs = this.diff_main(text1a, text2a, false, deadline);                                // 425
  var diffsb = this.diff_main(text1b, text2b, false, deadline);                               // 426
                                                                                              // 427
  return diffs.concat(diffsb);                                                                // 428
};                                                                                            // 429
                                                                                              // 430
                                                                                              // 431
/**                                                                                           // 432
 * Split two texts into an array of strings.  Reduce the texts to a string of                 // 433
 * hashes where each Unicode character represents one line.                                   // 434
 * @param {string} text1 First string.                                                        // 435
 * @param {string} text2 Second string.                                                       // 436
 * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}                     // 437
 *     An object containing the encoded text1, the encoded text2 and                          // 438
 *     the array of unique strings.                                                           // 439
 *     The zeroth element of the array of unique strings is intentionally blank.              // 440
 * @private                                                                                   // 441
 */                                                                                           // 442
diff_match_patch.prototype.diff_linesToChars_ = function(text1, text2) {                      // 443
  var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'                                      // 444
  var lineHash = {};   // e.g. lineHash['Hello\n'] == 4                                       // 445
                                                                                              // 446
  // '\x00' is a valid character, but various debuggers don't like it.                        // 447
  // So we'll insert a junk entry to avoid generating a null character.                       // 448
  lineArray[0] = '';                                                                          // 449
                                                                                              // 450
  /**                                                                                         // 451
   * Split a text into an array of strings.  Reduce the texts to a string of                  // 452
   * hashes where each Unicode character represents one line.                                 // 453
   * Modifies linearray and linehash through being a closure.                                 // 454
   * @param {string} text String to encode.                                                   // 455
   * @return {string} Encoded string.                                                         // 456
   * @private                                                                                 // 457
   */                                                                                         // 458
  function diff_linesToCharsMunge_(text) {                                                    // 459
    var chars = '';                                                                           // 460
    // Walk the text, pulling out a substring for each line.                                  // 461
    // text.split('\n') would would temporarily double our memory footprint.                  // 462
    // Modifying text would create many large strings to garbage collect.                     // 463
    var lineStart = 0;                                                                        // 464
    var lineEnd = -1;                                                                         // 465
    // Keeping our own length variable is faster than looking it up.                          // 466
    var lineArrayLength = lineArray.length;                                                   // 467
    while (lineEnd < text.length - 1) {                                                       // 468
      lineEnd = text.indexOf('\n', lineStart);                                                // 469
      if (lineEnd == -1) {                                                                    // 470
        lineEnd = text.length - 1;                                                            // 471
      }                                                                                       // 472
      var line = text.substring(lineStart, lineEnd + 1);                                      // 473
      lineStart = lineEnd + 1;                                                                // 474
                                                                                              // 475
      if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) :                           // 476
          (lineHash[line] !== undefined)) {                                                   // 477
        chars += String.fromCharCode(lineHash[line]);                                         // 478
      } else {                                                                                // 479
        chars += String.fromCharCode(lineArrayLength);                                        // 480
        lineHash[line] = lineArrayLength;                                                     // 481
        lineArray[lineArrayLength++] = line;                                                  // 482
      }                                                                                       // 483
    }                                                                                         // 484
    return chars;                                                                             // 485
  }                                                                                           // 486
                                                                                              // 487
  var chars1 = diff_linesToCharsMunge_(text1);                                                // 488
  var chars2 = diff_linesToCharsMunge_(text2);                                                // 489
  return {chars1: chars1, chars2: chars2, lineArray: lineArray};                              // 490
};                                                                                            // 491
                                                                                              // 492
                                                                                              // 493
/**                                                                                           // 494
 * Rehydrate the text in a diff from a string of line hashes to real lines of                 // 495
 * text.                                                                                      // 496
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 497
 * @param {!Array.<string>} lineArray Array of unique strings.                                // 498
 * @private                                                                                   // 499
 */                                                                                           // 500
diff_match_patch.prototype.diff_charsToLines_ = function(diffs, lineArray) {                  // 501
  for (var x = 0; x < diffs.length; x++) {                                                    // 502
    var chars = diffs[x][1];                                                                  // 503
    var text = [];                                                                            // 504
    for (var y = 0; y < chars.length; y++) {                                                  // 505
      text[y] = lineArray[chars.charCodeAt(y)];                                               // 506
    }                                                                                         // 507
    diffs[x][1] = text.join('');                                                              // 508
  }                                                                                           // 509
};                                                                                            // 510
                                                                                              // 511
                                                                                              // 512
/**                                                                                           // 513
 * Determine the common prefix of two strings.                                                // 514
 * @param {string} text1 First string.                                                        // 515
 * @param {string} text2 Second string.                                                       // 516
 * @return {number} The number of characters common to the start of each                      // 517
 *     string.                                                                                // 518
 */                                                                                           // 519
diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {                       // 520
  // Quick check for common null cases.                                                       // 521
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {                               // 522
    return 0;                                                                                 // 523
  }                                                                                           // 524
  // Binary search.                                                                           // 525
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/                           // 526
  var pointermin = 0;                                                                         // 527
  var pointermax = Math.min(text1.length, text2.length);                                      // 528
  var pointermid = pointermax;                                                                // 529
  var pointerstart = 0;                                                                       // 530
  while (pointermin < pointermid) {                                                           // 531
    if (text1.substring(pointerstart, pointermid) ==                                          // 532
        text2.substring(pointerstart, pointermid)) {                                          // 533
      pointermin = pointermid;                                                                // 534
      pointerstart = pointermin;                                                              // 535
    } else {                                                                                  // 536
      pointermax = pointermid;                                                                // 537
    }                                                                                         // 538
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);                      // 539
  }                                                                                           // 540
  return pointermid;                                                                          // 541
};                                                                                            // 542
                                                                                              // 543
                                                                                              // 544
/**                                                                                           // 545
 * Determine the common suffix of two strings.                                                // 546
 * @param {string} text1 First string.                                                        // 547
 * @param {string} text2 Second string.                                                       // 548
 * @return {number} The number of characters common to the end of each string.                // 549
 */                                                                                           // 550
diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {                       // 551
  // Quick check for common null cases.                                                       // 552
  if (!text1 || !text2 ||                                                                     // 553
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {                     // 554
    return 0;                                                                                 // 555
  }                                                                                           // 556
  // Binary search.                                                                           // 557
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/                           // 558
  var pointermin = 0;                                                                         // 559
  var pointermax = Math.min(text1.length, text2.length);                                      // 560
  var pointermid = pointermax;                                                                // 561
  var pointerend = 0;                                                                         // 562
  while (pointermin < pointermid) {                                                           // 563
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==              // 564
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {              // 565
      pointermin = pointermid;                                                                // 566
      pointerend = pointermin;                                                                // 567
    } else {                                                                                  // 568
      pointermax = pointermid;                                                                // 569
    }                                                                                         // 570
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);                      // 571
  }                                                                                           // 572
  return pointermid;                                                                          // 573
};                                                                                            // 574
                                                                                              // 575
                                                                                              // 576
/**                                                                                           // 577
 * Determine if the suffix of one string is the prefix of another.                            // 578
 * @param {string} text1 First string.                                                        // 579
 * @param {string} text2 Second string.                                                       // 580
 * @return {number} The number of characters common to the end of the first                   // 581
 *     string and the start of the second string.                                             // 582
 * @private                                                                                   // 583
 */                                                                                           // 584
diff_match_patch.prototype.diff_commonOverlap_ = function(text1, text2) {                     // 585
  // Cache the text lengths to prevent multiple calls.                                        // 586
  var text1_length = text1.length;                                                            // 587
  var text2_length = text2.length;                                                            // 588
  // Eliminate the null case.                                                                 // 589
  if (text1_length == 0 || text2_length == 0) {                                               // 590
    return 0;                                                                                 // 591
  }                                                                                           // 592
  // Truncate the longer string.                                                              // 593
  if (text1_length > text2_length) {                                                          // 594
    text1 = text1.substring(text1_length - text2_length);                                     // 595
  } else if (text1_length < text2_length) {                                                   // 596
    text2 = text2.substring(0, text1_length);                                                 // 597
  }                                                                                           // 598
  var text_length = Math.min(text1_length, text2_length);                                     // 599
  // Quick check for the worst case.                                                          // 600
  if (text1 == text2) {                                                                       // 601
    return text_length;                                                                       // 602
  }                                                                                           // 603
                                                                                              // 604
  // Start by looking for a single character match                                            // 605
  // and increase length until no match is found.                                             // 606
  // Performance analysis: http://neil.fraser.name/news/2010/11/04/                           // 607
  var best = 0;                                                                               // 608
  var length = 1;                                                                             // 609
  while (true) {                                                                              // 610
    var pattern = text1.substring(text_length - length);                                      // 611
    var found = text2.indexOf(pattern);                                                       // 612
    if (found == -1) {                                                                        // 613
      return best;                                                                            // 614
    }                                                                                         // 615
    length += found;                                                                          // 616
    if (found == 0 || text1.substring(text_length - length) ==                                // 617
        text2.substring(0, length)) {                                                         // 618
      best = length;                                                                          // 619
      length++;                                                                               // 620
    }                                                                                         // 621
  }                                                                                           // 622
};                                                                                            // 623
                                                                                              // 624
                                                                                              // 625
/**                                                                                           // 626
 * Do the two texts share a substring which is at least half the length of the                // 627
 * longer text?                                                                               // 628
 * This speedup can produce non-minimal diffs.                                                // 629
 * @param {string} text1 First string.                                                        // 630
 * @param {string} text2 Second string.                                                       // 631
 * @return {Array.<string>} Five element Array, containing the prefix of                      // 632
 *     text1, the suffix of text1, the prefix of text2, the suffix of                         // 633
 *     text2 and the common middle.  Or null if there was no match.                           // 634
 * @private                                                                                   // 635
 */                                                                                           // 636
diff_match_patch.prototype.diff_halfMatch_ = function(text1, text2) {                         // 637
  if (this.Diff_Timeout <= 0) {                                                               // 638
    // Don't risk returning a non-optimal diff if we have unlimited time.                     // 639
    return null;                                                                              // 640
  }                                                                                           // 641
  var longtext = text1.length > text2.length ? text1 : text2;                                 // 642
  var shorttext = text1.length > text2.length ? text2 : text1;                                // 643
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {                        // 644
    return null;  // Pointless.                                                               // 645
  }                                                                                           // 646
  var dmp = this;  // 'this' becomes 'window' in a closure.                                   // 647
                                                                                              // 648
  /**                                                                                         // 649
   * Does a substring of shorttext exist within longtext such that the substring              // 650
   * is at least half the length of longtext?                                                 // 651
   * Closure, but does not reference any external variables.                                  // 652
   * @param {string} longtext Longer string.                                                  // 653
   * @param {string} shorttext Shorter string.                                                // 654
   * @param {number} i Start index of quarter length substring within longtext.               // 655
   * @return {Array.<string>} Five element Array, containing the prefix of                    // 656
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix                // 657
   *     of shorttext and the common middle.  Or null if there was no match.                  // 658
   * @private                                                                                 // 659
   */                                                                                         // 660
  function diff_halfMatchI_(longtext, shorttext, i) {                                         // 661
    // Start with a 1/4 length substring at position i as a seed.                             // 662
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));                    // 663
    var j = -1;                                                                               // 664
    var best_common = '';                                                                     // 665
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;                 // 666
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {                                      // 667
      var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),                         // 668
                                               shorttext.substring(j));                       // 669
      var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),                      // 670
                                               shorttext.substring(0, j));                    // 671
      if (best_common.length < suffixLength + prefixLength) {                                 // 672
        best_common = shorttext.substring(j - suffixLength, j) +                              // 673
            shorttext.substring(j, j + prefixLength);                                         // 674
        best_longtext_a = longtext.substring(0, i - suffixLength);                            // 675
        best_longtext_b = longtext.substring(i + prefixLength);                               // 676
        best_shorttext_a = shorttext.substring(0, j - suffixLength);                          // 677
        best_shorttext_b = shorttext.substring(j + prefixLength);                             // 678
      }                                                                                       // 679
    }                                                                                         // 680
    if (best_common.length * 2 >= longtext.length) {                                          // 681
      return [best_longtext_a, best_longtext_b,                                               // 682
              best_shorttext_a, best_shorttext_b, best_common];                               // 683
    } else {                                                                                  // 684
      return null;                                                                            // 685
    }                                                                                         // 686
  }                                                                                           // 687
                                                                                              // 688
  // First check if the second quarter is the seed for a half-match.                          // 689
  var hm1 = diff_halfMatchI_(longtext, shorttext,                                             // 690
                             Math.ceil(longtext.length / 4));                                 // 691
  // Check again based on the third quarter.                                                  // 692
  var hm2 = diff_halfMatchI_(longtext, shorttext,                                             // 693
                             Math.ceil(longtext.length / 2));                                 // 694
  var hm;                                                                                     // 695
  if (!hm1 && !hm2) {                                                                         // 696
    return null;                                                                              // 697
  } else if (!hm2) {                                                                          // 698
    hm = hm1;                                                                                 // 699
  } else if (!hm1) {                                                                          // 700
    hm = hm2;                                                                                 // 701
  } else {                                                                                    // 702
    // Both matched.  Select the longest.                                                     // 703
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;                                           // 704
  }                                                                                           // 705
                                                                                              // 706
  // A half-match was found, sort out the return data.                                        // 707
  var text1_a, text1_b, text2_a, text2_b;                                                     // 708
  if (text1.length > text2.length) {                                                          // 709
    text1_a = hm[0];                                                                          // 710
    text1_b = hm[1];                                                                          // 711
    text2_a = hm[2];                                                                          // 712
    text2_b = hm[3];                                                                          // 713
  } else {                                                                                    // 714
    text2_a = hm[0];                                                                          // 715
    text2_b = hm[1];                                                                          // 716
    text1_a = hm[2];                                                                          // 717
    text1_b = hm[3];                                                                          // 718
  }                                                                                           // 719
  var mid_common = hm[4];                                                                     // 720
  return [text1_a, text1_b, text2_a, text2_b, mid_common];                                    // 721
};                                                                                            // 722
                                                                                              // 723
                                                                                              // 724
/**                                                                                           // 725
 * Reduce the number of edits by eliminating semantically trivial equalities.                 // 726
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 727
 */                                                                                           // 728
diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {                           // 729
  var changes = false;                                                                        // 730
  var equalities = [];  // Stack of indices where equalities are found.                       // 731
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.                   // 732
  /** @type {?string} */                                                                      // 733
  var lastequality = null;                                                                    // 734
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]                               // 735
  var pointer = 0;  // Index of current position.                                             // 736
  // Number of characters that changed prior to the equality.                                 // 737
  var length_insertions1 = 0;                                                                 // 738
  var length_deletions1 = 0;                                                                  // 739
  // Number of characters that changed after the equality.                                    // 740
  var length_insertions2 = 0;                                                                 // 741
  var length_deletions2 = 0;                                                                  // 742
  while (pointer < diffs.length) {                                                            // 743
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.                                // 744
      equalities[equalitiesLength++] = pointer;                                               // 745
      length_insertions1 = length_insertions2;                                                // 746
      length_deletions1 = length_deletions2;                                                  // 747
      length_insertions2 = 0;                                                                 // 748
      length_deletions2 = 0;                                                                  // 749
      lastequality = diffs[pointer][1];                                                       // 750
    } else {  // An insertion or deletion.                                                    // 751
      if (diffs[pointer][0] == DIFF_INSERT) {                                                 // 752
        length_insertions2 += diffs[pointer][1].length;                                       // 753
      } else {                                                                                // 754
        length_deletions2 += diffs[pointer][1].length;                                        // 755
      }                                                                                       // 756
      // Eliminate an equality that is smaller or equal to the edits on both                  // 757
      // sides of it.                                                                         // 758
      if (lastequality && (lastequality.length <=                                             // 759
          Math.max(length_insertions1, length_deletions1)) &&                                 // 760
          (lastequality.length <= Math.max(length_insertions2,                                // 761
                                           length_deletions2))) {                             // 762
        // Duplicate record.                                                                  // 763
        diffs.splice(equalities[equalitiesLength - 1], 0,                                     // 764
                     [DIFF_DELETE, lastequality]);                                            // 765
        // Change second copy to insert.                                                      // 766
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;                         // 767
        // Throw away the equality we just deleted.                                           // 768
        equalitiesLength--;                                                                   // 769
        // Throw away the previous equality (it needs to be reevaluated).                     // 770
        equalitiesLength--;                                                                   // 771
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;               // 772
        length_insertions1 = 0;  // Reset the counters.                                       // 773
        length_deletions1 = 0;                                                                // 774
        length_insertions2 = 0;                                                               // 775
        length_deletions2 = 0;                                                                // 776
        lastequality = null;                                                                  // 777
        changes = true;                                                                       // 778
      }                                                                                       // 779
    }                                                                                         // 780
    pointer++;                                                                                // 781
  }                                                                                           // 782
                                                                                              // 783
  // Normalize the diff.                                                                      // 784
  if (changes) {                                                                              // 785
    this.diff_cleanupMerge(diffs);                                                            // 786
  }                                                                                           // 787
  this.diff_cleanupSemanticLossless(diffs);                                                   // 788
                                                                                              // 789
  // Find any overlaps between deletions and insertions.                                      // 790
  // e.g: <del>abcxxx</del><ins>xxxdef</ins>                                                  // 791
  //   -> <del>abc</del>xxx<ins>def</ins>                                                     // 792
  // e.g: <del>xxxabc</del><ins>defxxx</ins>                                                  // 793
  //   -> <ins>def</ins>xxx<del>abc</del>                                                     // 794
  // Only extract an overlap if it is as big as the edit ahead or behind it.                  // 795
  pointer = 1;                                                                                // 796
  while (pointer < diffs.length) {                                                            // 797
    if (diffs[pointer - 1][0] == DIFF_DELETE &&                                               // 798
        diffs[pointer][0] == DIFF_INSERT) {                                                   // 799
      var deletion = diffs[pointer - 1][1];                                                   // 800
      var insertion = diffs[pointer][1];                                                      // 801
      var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);                    // 802
      var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);                    // 803
      if (overlap_length1 >= overlap_length2) {                                               // 804
        if (overlap_length1 >= deletion.length / 2 ||                                         // 805
            overlap_length1 >= insertion.length / 2) {                                        // 806
          // Overlap found.  Insert an equality and trim the surrounding edits.               // 807
          diffs.splice(pointer, 0,                                                            // 808
              [DIFF_EQUAL, insertion.substring(0, overlap_length1)]);                         // 809
          diffs[pointer - 1][1] =                                                             // 810
              deletion.substring(0, deletion.length - overlap_length1);                       // 811
          diffs[pointer + 1][1] = insertion.substring(overlap_length1);                       // 812
          pointer++;                                                                          // 813
        }                                                                                     // 814
      } else {                                                                                // 815
        if (overlap_length2 >= deletion.length / 2 ||                                         // 816
            overlap_length2 >= insertion.length / 2) {                                        // 817
          // Reverse overlap found.                                                           // 818
          // Insert an equality and swap and trim the surrounding edits.                      // 819
          diffs.splice(pointer, 0,                                                            // 820
              [DIFF_EQUAL, deletion.substring(0, overlap_length2)]);                          // 821
          diffs[pointer - 1][0] = DIFF_INSERT;                                                // 822
          diffs[pointer - 1][1] =                                                             // 823
              insertion.substring(0, insertion.length - overlap_length2);                     // 824
          diffs[pointer + 1][0] = DIFF_DELETE;                                                // 825
          diffs[pointer + 1][1] =                                                             // 826
              deletion.substring(overlap_length2);                                            // 827
          pointer++;                                                                          // 828
        }                                                                                     // 829
      }                                                                                       // 830
      pointer++;                                                                              // 831
    }                                                                                         // 832
    pointer++;                                                                                // 833
  }                                                                                           // 834
};                                                                                            // 835
                                                                                              // 836
                                                                                              // 837
/**                                                                                           // 838
 * Look for single edits surrounded on both sides by equalities                               // 839
 * which can be shifted sideways to align the edit to a word boundary.                        // 840
 * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.                                  // 841
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 842
 */                                                                                           // 843
diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {                   // 844
  /**                                                                                         // 845
   * Given two strings, compute a score representing whether the internal                     // 846
   * boundary falls on logical boundaries.                                                    // 847
   * Scores range from 6 (best) to 0 (worst).                                                 // 848
   * Closure, but does not reference any external variables.                                  // 849
   * @param {string} one First string.                                                        // 850
   * @param {string} two Second string.                                                       // 851
   * @return {number} The score.                                                              // 852
   * @private                                                                                 // 853
   */                                                                                         // 854
  function diff_cleanupSemanticScore_(one, two) {                                             // 855
    if (!one || !two) {                                                                       // 856
      // Edges are the best.                                                                  // 857
      return 6;                                                                               // 858
    }                                                                                         // 859
                                                                                              // 860
    // Each port of this function behaves slightly differently due to                         // 861
    // subtle differences in each language's definition of things like                        // 862
    // 'whitespace'.  Since this function's purpose is largely cosmetic,                      // 863
    // the choice has been made to use each language's native features                        // 864
    // rather than force total conformity.                                                    // 865
    var char1 = one.charAt(one.length - 1);                                                   // 866
    var char2 = two.charAt(0);                                                                // 867
    var nonAlphaNumeric1 = char1.match(diff_match_patch.nonAlphaNumericRegex_);               // 868
    var nonAlphaNumeric2 = char2.match(diff_match_patch.nonAlphaNumericRegex_);               // 869
    var whitespace1 = nonAlphaNumeric1 &&                                                     // 870
        char1.match(diff_match_patch.whitespaceRegex_);                                       // 871
    var whitespace2 = nonAlphaNumeric2 &&                                                     // 872
        char2.match(diff_match_patch.whitespaceRegex_);                                       // 873
    var lineBreak1 = whitespace1 &&                                                           // 874
        char1.match(diff_match_patch.linebreakRegex_);                                        // 875
    var lineBreak2 = whitespace2 &&                                                           // 876
        char2.match(diff_match_patch.linebreakRegex_);                                        // 877
    var blankLine1 = lineBreak1 &&                                                            // 878
        one.match(diff_match_patch.blanklineEndRegex_);                                       // 879
    var blankLine2 = lineBreak2 &&                                                            // 880
        two.match(diff_match_patch.blanklineStartRegex_);                                     // 881
                                                                                              // 882
    if (blankLine1 || blankLine2) {                                                           // 883
      // Five points for blank lines.                                                         // 884
      return 5;                                                                               // 885
    } else if (lineBreak1 || lineBreak2) {                                                    // 886
      // Four points for line breaks.                                                         // 887
      return 4;                                                                               // 888
    } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {                             // 889
      // Three points for end of sentences.                                                   // 890
      return 3;                                                                               // 891
    } else if (whitespace1 || whitespace2) {                                                  // 892
      // Two points for whitespace.                                                           // 893
      return 2;                                                                               // 894
    } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {                                        // 895
      // One point for non-alphanumeric.                                                      // 896
      return 1;                                                                               // 897
    }                                                                                         // 898
    return 0;                                                                                 // 899
  }                                                                                           // 900
                                                                                              // 901
  var pointer = 1;                                                                            // 902
  // Intentionally ignore the first and last element (don't need checking).                   // 903
  while (pointer < diffs.length - 1) {                                                        // 904
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&                                                // 905
        diffs[pointer + 1][0] == DIFF_EQUAL) {                                                // 906
      // This is a single edit surrounded by equalities.                                      // 907
      var equality1 = diffs[pointer - 1][1];                                                  // 908
      var edit = diffs[pointer][1];                                                           // 909
      var equality2 = diffs[pointer + 1][1];                                                  // 910
                                                                                              // 911
      // First, shift the edit as far left as possible.                                       // 912
      var commonOffset = this.diff_commonSuffix(equality1, edit);                             // 913
      if (commonOffset) {                                                                     // 914
        var commonString = edit.substring(edit.length - commonOffset);                        // 915
        equality1 = equality1.substring(0, equality1.length - commonOffset);                  // 916
        edit = commonString + edit.substring(0, edit.length - commonOffset);                  // 917
        equality2 = commonString + equality2;                                                 // 918
      }                                                                                       // 919
                                                                                              // 920
      // Second, step character by character right, looking for the best fit.                 // 921
      var bestEquality1 = equality1;                                                          // 922
      var bestEdit = edit;                                                                    // 923
      var bestEquality2 = equality2;                                                          // 924
      var bestScore = diff_cleanupSemanticScore_(equality1, edit) +                           // 925
          diff_cleanupSemanticScore_(edit, equality2);                                        // 926
      while (edit.charAt(0) === equality2.charAt(0)) {                                        // 927
        equality1 += edit.charAt(0);                                                          // 928
        edit = edit.substring(1) + equality2.charAt(0);                                       // 929
        equality2 = equality2.substring(1);                                                   // 930
        var score = diff_cleanupSemanticScore_(equality1, edit) +                             // 931
            diff_cleanupSemanticScore_(edit, equality2);                                      // 932
        // The >= encourages trailing rather than leading whitespace on edits.                // 933
        if (score >= bestScore) {                                                             // 934
          bestScore = score;                                                                  // 935
          bestEquality1 = equality1;                                                          // 936
          bestEdit = edit;                                                                    // 937
          bestEquality2 = equality2;                                                          // 938
        }                                                                                     // 939
      }                                                                                       // 940
                                                                                              // 941
      if (diffs[pointer - 1][1] != bestEquality1) {                                           // 942
        // We have an improvement, save it back to the diff.                                  // 943
        if (bestEquality1) {                                                                  // 944
          diffs[pointer - 1][1] = bestEquality1;                                              // 945
        } else {                                                                              // 946
          diffs.splice(pointer - 1, 1);                                                       // 947
          pointer--;                                                                          // 948
        }                                                                                     // 949
        diffs[pointer][1] = bestEdit;                                                         // 950
        if (bestEquality2) {                                                                  // 951
          diffs[pointer + 1][1] = bestEquality2;                                              // 952
        } else {                                                                              // 953
          diffs.splice(pointer + 1, 1);                                                       // 954
          pointer--;                                                                          // 955
        }                                                                                     // 956
      }                                                                                       // 957
    }                                                                                         // 958
    pointer++;                                                                                // 959
  }                                                                                           // 960
};                                                                                            // 961
                                                                                              // 962
// Define some regex patterns for matching boundaries.                                        // 963
diff_match_patch.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;                                      // 964
diff_match_patch.whitespaceRegex_ = /\s/;                                                     // 965
diff_match_patch.linebreakRegex_ = /[\r\n]/;                                                  // 966
diff_match_patch.blanklineEndRegex_ = /\n\r?\n$/;                                             // 967
diff_match_patch.blanklineStartRegex_ = /^\r?\n\r?\n/;                                        // 968
                                                                                              // 969
/**                                                                                           // 970
 * Reduce the number of edits by eliminating operationally trivial equalities.                // 971
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 972
 */                                                                                           // 973
diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {                         // 974
  var changes = false;                                                                        // 975
  var equalities = [];  // Stack of indices where equalities are found.                       // 976
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.                   // 977
  /** @type {?string} */                                                                      // 978
  var lastequality = null;                                                                    // 979
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]                               // 980
  var pointer = 0;  // Index of current position.                                             // 981
  // Is there an insertion operation before the last equality.                                // 982
  var pre_ins = false;                                                                        // 983
  // Is there a deletion operation before the last equality.                                  // 984
  var pre_del = false;                                                                        // 985
  // Is there an insertion operation after the last equality.                                 // 986
  var post_ins = false;                                                                       // 987
  // Is there a deletion operation after the last equality.                                   // 988
  var post_del = false;                                                                       // 989
  while (pointer < diffs.length) {                                                            // 990
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.                                // 991
      if (diffs[pointer][1].length < this.Diff_EditCost &&                                    // 992
          (post_ins || post_del)) {                                                           // 993
        // Candidate found.                                                                   // 994
        equalities[equalitiesLength++] = pointer;                                             // 995
        pre_ins = post_ins;                                                                   // 996
        pre_del = post_del;                                                                   // 997
        lastequality = diffs[pointer][1];                                                     // 998
      } else {                                                                                // 999
        // Not a candidate, and can never become one.                                         // 1000
        equalitiesLength = 0;                                                                 // 1001
        lastequality = null;                                                                  // 1002
      }                                                                                       // 1003
      post_ins = post_del = false;                                                            // 1004
    } else {  // An insertion or deletion.                                                    // 1005
      if (diffs[pointer][0] == DIFF_DELETE) {                                                 // 1006
        post_del = true;                                                                      // 1007
      } else {                                                                                // 1008
        post_ins = true;                                                                      // 1009
      }                                                                                       // 1010
      /*                                                                                      // 1011
       * Five types to be split:                                                              // 1012
       * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>                                   // 1013
       * <ins>A</ins>X<ins>C</ins><del>D</del>                                                // 1014
       * <ins>A</ins><del>B</del>X<ins>C</ins>                                                // 1015
       * <ins>A</del>X<ins>C</ins><del>D</del>                                                // 1016
       * <ins>A</ins><del>B</del>X<del>C</del>                                                // 1017
       */                                                                                     // 1018
      if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||                    // 1019
                           ((lastequality.length < this.Diff_EditCost / 2) &&                 // 1020
                            (pre_ins + pre_del + post_ins + post_del) == 3))) {               // 1021
        // Duplicate record.                                                                  // 1022
        diffs.splice(equalities[equalitiesLength - 1], 0,                                     // 1023
                     [DIFF_DELETE, lastequality]);                                            // 1024
        // Change second copy to insert.                                                      // 1025
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;                         // 1026
        equalitiesLength--;  // Throw away the equality we just deleted;                      // 1027
        lastequality = null;                                                                  // 1028
        if (pre_ins && pre_del) {                                                             // 1029
          // No changes made which could affect previous entry, keep going.                   // 1030
          post_ins = post_del = true;                                                         // 1031
          equalitiesLength = 0;                                                               // 1032
        } else {                                                                              // 1033
          equalitiesLength--;  // Throw away the previous equality.                           // 1034
          pointer = equalitiesLength > 0 ?                                                    // 1035
              equalities[equalitiesLength - 1] : -1;                                          // 1036
          post_ins = post_del = false;                                                        // 1037
        }                                                                                     // 1038
        changes = true;                                                                       // 1039
      }                                                                                       // 1040
    }                                                                                         // 1041
    pointer++;                                                                                // 1042
  }                                                                                           // 1043
                                                                                              // 1044
  if (changes) {                                                                              // 1045
    this.diff_cleanupMerge(diffs);                                                            // 1046
  }                                                                                           // 1047
};                                                                                            // 1048
                                                                                              // 1049
                                                                                              // 1050
/**                                                                                           // 1051
 * Reorder and merge like edit sections.  Merge equalities.                                   // 1052
 * Any edit section can move as long as it doesn't cross an equality.                         // 1053
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1054
 */                                                                                           // 1055
diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {                              // 1056
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.                             // 1057
  var pointer = 0;                                                                            // 1058
  var count_delete = 0;                                                                       // 1059
  var count_insert = 0;                                                                       // 1060
  var text_delete = '';                                                                       // 1061
  var text_insert = '';                                                                       // 1062
  var commonlength;                                                                           // 1063
  while (pointer < diffs.length) {                                                            // 1064
    switch (diffs[pointer][0]) {                                                              // 1065
      case DIFF_INSERT:                                                                       // 1066
        count_insert++;                                                                       // 1067
        text_insert += diffs[pointer][1];                                                     // 1068
        pointer++;                                                                            // 1069
        break;                                                                                // 1070
      case DIFF_DELETE:                                                                       // 1071
        count_delete++;                                                                       // 1072
        text_delete += diffs[pointer][1];                                                     // 1073
        pointer++;                                                                            // 1074
        break;                                                                                // 1075
      case DIFF_EQUAL:                                                                        // 1076
        // Upon reaching an equality, check for prior redundancies.                           // 1077
        if (count_delete + count_insert > 1) {                                                // 1078
          if (count_delete !== 0 && count_insert !== 0) {                                     // 1079
            // Factor out any common prefixies.                                               // 1080
            commonlength = this.diff_commonPrefix(text_insert, text_delete);                  // 1081
            if (commonlength !== 0) {                                                         // 1082
              if ((pointer - count_delete - count_insert) > 0 &&                              // 1083
                  diffs[pointer - count_delete - count_insert - 1][0] ==                      // 1084
                  DIFF_EQUAL) {                                                               // 1085
                diffs[pointer - count_delete - count_insert - 1][1] +=                        // 1086
                    text_insert.substring(0, commonlength);                                   // 1087
              } else {                                                                        // 1088
                diffs.splice(0, 0, [DIFF_EQUAL,                                               // 1089
                                    text_insert.substring(0, commonlength)]);                 // 1090
                pointer++;                                                                    // 1091
              }                                                                               // 1092
              text_insert = text_insert.substring(commonlength);                              // 1093
              text_delete = text_delete.substring(commonlength);                              // 1094
            }                                                                                 // 1095
            // Factor out any common suffixies.                                               // 1096
            commonlength = this.diff_commonSuffix(text_insert, text_delete);                  // 1097
            if (commonlength !== 0) {                                                         // 1098
              diffs[pointer][1] = text_insert.substring(text_insert.length -                  // 1099
                  commonlength) + diffs[pointer][1];                                          // 1100
              text_insert = text_insert.substring(0, text_insert.length -                     // 1101
                  commonlength);                                                              // 1102
              text_delete = text_delete.substring(0, text_delete.length -                     // 1103
                  commonlength);                                                              // 1104
            }                                                                                 // 1105
          }                                                                                   // 1106
          // Delete the offending records and add the merged ones.                            // 1107
          if (count_delete === 0) {                                                           // 1108
            diffs.splice(pointer - count_insert,                                              // 1109
                count_delete + count_insert, [DIFF_INSERT, text_insert]);                     // 1110
          } else if (count_insert === 0) {                                                    // 1111
            diffs.splice(pointer - count_delete,                                              // 1112
                count_delete + count_insert, [DIFF_DELETE, text_delete]);                     // 1113
          } else {                                                                            // 1114
            diffs.splice(pointer - count_delete - count_insert,                               // 1115
                count_delete + count_insert, [DIFF_DELETE, text_delete],                      // 1116
                [DIFF_INSERT, text_insert]);                                                  // 1117
          }                                                                                   // 1118
          pointer = pointer - count_delete - count_insert +                                   // 1119
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;                      // 1120
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {                    // 1121
          // Merge this equality with the previous one.                                       // 1122
          diffs[pointer - 1][1] += diffs[pointer][1];                                         // 1123
          diffs.splice(pointer, 1);                                                           // 1124
        } else {                                                                              // 1125
          pointer++;                                                                          // 1126
        }                                                                                     // 1127
        count_insert = 0;                                                                     // 1128
        count_delete = 0;                                                                     // 1129
        text_delete = '';                                                                     // 1130
        text_insert = '';                                                                     // 1131
        break;                                                                                // 1132
    }                                                                                         // 1133
  }                                                                                           // 1134
  if (diffs[diffs.length - 1][1] === '') {                                                    // 1135
    diffs.pop();  // Remove the dummy entry at the end.                                       // 1136
  }                                                                                           // 1137
                                                                                              // 1138
  // Second pass: look for single edits surrounded on both sides by equalities                // 1139
  // which can be shifted sideways to eliminate an equality.                                  // 1140
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC                                                  // 1141
  var changes = false;                                                                        // 1142
  pointer = 1;                                                                                // 1143
  // Intentionally ignore the first and last element (don't need checking).                   // 1144
  while (pointer < diffs.length - 1) {                                                        // 1145
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&                                                // 1146
        diffs[pointer + 1][0] == DIFF_EQUAL) {                                                // 1147
      // This is a single edit surrounded by equalities.                                      // 1148
      if (diffs[pointer][1].substring(diffs[pointer][1].length -                              // 1149
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {                           // 1150
        // Shift the edit over the previous equality.                                         // 1151
        diffs[pointer][1] = diffs[pointer - 1][1] +                                           // 1152
            diffs[pointer][1].substring(0, diffs[pointer][1].length -                         // 1153
                                        diffs[pointer - 1][1].length);                        // 1154
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];                // 1155
        diffs.splice(pointer - 1, 1);                                                         // 1156
        changes = true;                                                                       // 1157
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==              // 1158
          diffs[pointer + 1][1]) {                                                            // 1159
        // Shift the edit over the next equality.                                             // 1160
        diffs[pointer - 1][1] += diffs[pointer + 1][1];                                       // 1161
        diffs[pointer][1] =                                                                   // 1162
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +                       // 1163
            diffs[pointer + 1][1];                                                            // 1164
        diffs.splice(pointer + 1, 1);                                                         // 1165
        changes = true;                                                                       // 1166
      }                                                                                       // 1167
    }                                                                                         // 1168
    pointer++;                                                                                // 1169
  }                                                                                           // 1170
  // If shifts were made, the diff needs reordering and another shift sweep.                  // 1171
  if (changes) {                                                                              // 1172
    this.diff_cleanupMerge(diffs);                                                            // 1173
  }                                                                                           // 1174
};                                                                                            // 1175
                                                                                              // 1176
                                                                                              // 1177
/**                                                                                           // 1178
 * loc is a location in text1, compute and return the equivalent location in                  // 1179
 * text2.                                                                                     // 1180
 * e.g. 'The cat' vs 'The big cat', 1->1, 5->8                                                // 1181
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1182
 * @param {number} loc Location within text1.                                                 // 1183
 * @return {number} Location within text2.                                                    // 1184
 */                                                                                           // 1185
diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {                               // 1186
  var chars1 = 0;                                                                             // 1187
  var chars2 = 0;                                                                             // 1188
  var last_chars1 = 0;                                                                        // 1189
  var last_chars2 = 0;                                                                        // 1190
  var x;                                                                                      // 1191
  for (x = 0; x < diffs.length; x++) {                                                        // 1192
    if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.                              // 1193
      chars1 += diffs[x][1].length;                                                           // 1194
    }                                                                                         // 1195
    if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.                             // 1196
      chars2 += diffs[x][1].length;                                                           // 1197
    }                                                                                         // 1198
    if (chars1 > loc) {  // Overshot the location.                                            // 1199
      break;                                                                                  // 1200
    }                                                                                         // 1201
    last_chars1 = chars1;                                                                     // 1202
    last_chars2 = chars2;                                                                     // 1203
  }                                                                                           // 1204
  // Was the location was deleted?                                                            // 1205
  if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {                                     // 1206
    return last_chars2;                                                                       // 1207
  }                                                                                           // 1208
  // Add the remaining character length.                                                      // 1209
  return last_chars2 + (loc - last_chars1);                                                   // 1210
};                                                                                            // 1211
                                                                                              // 1212
                                                                                              // 1213
/**                                                                                           // 1214
 * Convert a diff array into a pretty HTML report.                                            // 1215
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1216
 * @return {string} HTML representation.                                                      // 1217
 */                                                                                           // 1218
diff_match_patch.prototype.diff_prettyHtml = function(diffs) {                                // 1219
  var html = [];                                                                              // 1220
  var pattern_amp = /&/g;                                                                     // 1221
  var pattern_lt = /</g;                                                                      // 1222
  var pattern_gt = />/g;                                                                      // 1223
  var pattern_para = /\n/g;                                                                   // 1224
  for (var x = 0; x < diffs.length; x++) {                                                    // 1225
    var op = diffs[x][0];    // Operation (insert, delete, equal)                             // 1226
    var data = diffs[x][1];  // Text of change.                                               // 1227
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')                 // 1228
        .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');                     // 1229
    switch (op) {                                                                             // 1230
      case DIFF_INSERT:                                                                       // 1231
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';                      // 1232
        break;                                                                                // 1233
      case DIFF_DELETE:                                                                       // 1234
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';                      // 1235
        break;                                                                                // 1236
      case DIFF_EQUAL:                                                                        // 1237
        html[x] = '<span>' + text + '</span>';                                                // 1238
        break;                                                                                // 1239
    }                                                                                         // 1240
  }                                                                                           // 1241
  return html.join('');                                                                       // 1242
};                                                                                            // 1243
                                                                                              // 1244
                                                                                              // 1245
/**                                                                                           // 1246
 * Compute and return the source text (all equalities and deletions).                         // 1247
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1248
 * @return {string} Source text.                                                              // 1249
 */                                                                                           // 1250
diff_match_patch.prototype.diff_text1 = function(diffs) {                                     // 1251
  var text = [];                                                                              // 1252
  for (var x = 0; x < diffs.length; x++) {                                                    // 1253
    if (diffs[x][0] !== DIFF_INSERT) {                                                        // 1254
      text[x] = diffs[x][1];                                                                  // 1255
    }                                                                                         // 1256
  }                                                                                           // 1257
  return text.join('');                                                                       // 1258
};                                                                                            // 1259
                                                                                              // 1260
                                                                                              // 1261
/**                                                                                           // 1262
 * Compute and return the destination text (all equalities and insertions).                   // 1263
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1264
 * @return {string} Destination text.                                                         // 1265
 */                                                                                           // 1266
diff_match_patch.prototype.diff_text2 = function(diffs) {                                     // 1267
  var text = [];                                                                              // 1268
  for (var x = 0; x < diffs.length; x++) {                                                    // 1269
    if (diffs[x][0] !== DIFF_DELETE) {                                                        // 1270
      text[x] = diffs[x][1];                                                                  // 1271
    }                                                                                         // 1272
  }                                                                                           // 1273
  return text.join('');                                                                       // 1274
};                                                                                            // 1275
                                                                                              // 1276
                                                                                              // 1277
/**                                                                                           // 1278
 * Compute the Levenshtein distance; the number of inserted, deleted or                       // 1279
 * substituted characters.                                                                    // 1280
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1281
 * @return {number} Number of changes.                                                        // 1282
 */                                                                                           // 1283
diff_match_patch.prototype.diff_levenshtein = function(diffs) {                               // 1284
  var levenshtein = 0;                                                                        // 1285
  var insertions = 0;                                                                         // 1286
  var deletions = 0;                                                                          // 1287
  for (var x = 0; x < diffs.length; x++) {                                                    // 1288
    var op = diffs[x][0];                                                                     // 1289
    var data = diffs[x][1];                                                                   // 1290
    switch (op) {                                                                             // 1291
      case DIFF_INSERT:                                                                       // 1292
        insertions += data.length;                                                            // 1293
        break;                                                                                // 1294
      case DIFF_DELETE:                                                                       // 1295
        deletions += data.length;                                                             // 1296
        break;                                                                                // 1297
      case DIFF_EQUAL:                                                                        // 1298
        // A deletion and an insertion is one substitution.                                   // 1299
        levenshtein += Math.max(insertions, deletions);                                       // 1300
        insertions = 0;                                                                       // 1301
        deletions = 0;                                                                        // 1302
        break;                                                                                // 1303
    }                                                                                         // 1304
  }                                                                                           // 1305
  levenshtein += Math.max(insertions, deletions);                                             // 1306
  return levenshtein;                                                                         // 1307
};                                                                                            // 1308
                                                                                              // 1309
                                                                                              // 1310
/**                                                                                           // 1311
 * Crush the diff into an encoded string which describes the operations                       // 1312
 * required to transform text1 into text2.                                                    // 1313
 * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.                          // 1314
 * Operations are tab-separated.  Inserted text is escaped using %xx notation.                // 1315
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1316
 * @return {string} Delta text.                                                               // 1317
 */                                                                                           // 1318
diff_match_patch.prototype.diff_toDelta = function(diffs) {                                   // 1319
  var text = [];                                                                              // 1320
  for (var x = 0; x < diffs.length; x++) {                                                    // 1321
    switch (diffs[x][0]) {                                                                    // 1322
      case DIFF_INSERT:                                                                       // 1323
        text[x] = '+' + encodeURI(diffs[x][1]);                                               // 1324
        break;                                                                                // 1325
      case DIFF_DELETE:                                                                       // 1326
        text[x] = '-' + diffs[x][1].length;                                                   // 1327
        break;                                                                                // 1328
      case DIFF_EQUAL:                                                                        // 1329
        text[x] = '=' + diffs[x][1].length;                                                   // 1330
        break;                                                                                // 1331
    }                                                                                         // 1332
  }                                                                                           // 1333
  return text.join('\t').replace(/%20/g, ' ');                                                // 1334
};                                                                                            // 1335
                                                                                              // 1336
                                                                                              // 1337
/**                                                                                           // 1338
 * Given the original text1, and an encoded string which describes the                        // 1339
 * operations required to transform text1 into text2, compute the full diff.                  // 1340
 * @param {string} text1 Source string for the diff.                                          // 1341
 * @param {string} delta Delta text.                                                          // 1342
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 1343
 * @throws {!Error} If invalid input.                                                         // 1344
 */                                                                                           // 1345
diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {                          // 1346
  var diffs = [];                                                                             // 1347
  var diffsLength = 0;  // Keeping our own length var is faster in JS.                        // 1348
  var pointer = 0;  // Cursor in text1                                                        // 1349
  var tokens = delta.split(/\t/g);                                                            // 1350
  for (var x = 0; x < tokens.length; x++) {                                                   // 1351
    // Each token begins with a one character parameter which specifies the                   // 1352
    // operation of this token (delete, insert, equality).                                    // 1353
    var param = tokens[x].substring(1);                                                       // 1354
    switch (tokens[x].charAt(0)) {                                                            // 1355
      case '+':                                                                               // 1356
        try {                                                                                 // 1357
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];                             // 1358
        } catch (ex) {                                                                        // 1359
          // Malformed URI sequence.                                                          // 1360
          throw new Error('Illegal escape in diff_fromDelta: ' + param);                      // 1361
        }                                                                                     // 1362
        break;                                                                                // 1363
      case '-':                                                                               // 1364
        // Fall through.                                                                      // 1365
      case '=':                                                                               // 1366
        var n = parseInt(param, 10);                                                          // 1367
        if (isNaN(n) || n < 0) {                                                              // 1368
          throw new Error('Invalid number in diff_fromDelta: ' + param);                      // 1369
        }                                                                                     // 1370
        var text = text1.substring(pointer, pointer += n);                                    // 1371
        if (tokens[x].charAt(0) == '=') {                                                     // 1372
          diffs[diffsLength++] = [DIFF_EQUAL, text];                                          // 1373
        } else {                                                                              // 1374
          diffs[diffsLength++] = [DIFF_DELETE, text];                                         // 1375
        }                                                                                     // 1376
        break;                                                                                // 1377
      default:                                                                                // 1378
        // Blank tokens are ok (from a trailing \t).                                          // 1379
        // Anything else is an error.                                                         // 1380
        if (tokens[x]) {                                                                      // 1381
          throw new Error('Invalid diff operation in diff_fromDelta: ' +                      // 1382
                          tokens[x]);                                                         // 1383
        }                                                                                     // 1384
    }                                                                                         // 1385
  }                                                                                           // 1386
  if (pointer != text1.length) {                                                              // 1387
    throw new Error('Delta length (' + pointer +                                              // 1388
        ') does not equal source text length (' + text1.length + ').');                       // 1389
  }                                                                                           // 1390
  return diffs;                                                                               // 1391
};                                                                                            // 1392
                                                                                              // 1393
                                                                                              // 1394
//  MATCH FUNCTIONS                                                                           // 1395
                                                                                              // 1396
                                                                                              // 1397
/**                                                                                           // 1398
 * Locate the best instance of 'pattern' in 'text' near 'loc'.                                // 1399
 * @param {string} text The text to search.                                                   // 1400
 * @param {string} pattern The pattern to search for.                                         // 1401
 * @param {number} loc The location to search around.                                         // 1402
 * @return {number} Best match index or -1.                                                   // 1403
 */                                                                                           // 1404
diff_match_patch.prototype.match_main = function(text, pattern, loc) {                        // 1405
  // Check for null inputs.                                                                   // 1406
  if (text == null || pattern == null || loc == null) {                                       // 1407
    throw new Error('Null input. (match_main)');                                              // 1408
  }                                                                                           // 1409
                                                                                              // 1410
  loc = Math.max(0, Math.min(loc, text.length));                                              // 1411
  if (text == pattern) {                                                                      // 1412
    // Shortcut (potentially not guaranteed by the algorithm)                                 // 1413
    return 0;                                                                                 // 1414
  } else if (!text.length) {                                                                  // 1415
    // Nothing to match.                                                                      // 1416
    return -1;                                                                                // 1417
  } else if (text.substring(loc, loc + pattern.length) == pattern) {                          // 1418
    // Perfect match at the perfect spot!  (Includes case of null pattern)                    // 1419
    return loc;                                                                               // 1420
  } else {                                                                                    // 1421
    // Do a fuzzy compare.                                                                    // 1422
    return this.match_bitap_(text, pattern, loc);                                             // 1423
  }                                                                                           // 1424
};                                                                                            // 1425
                                                                                              // 1426
                                                                                              // 1427
/**                                                                                           // 1428
 * Locate the best instance of 'pattern' in 'text' near 'loc' using the                       // 1429
 * Bitap algorithm.                                                                           // 1430
 * @param {string} text The text to search.                                                   // 1431
 * @param {string} pattern The pattern to search for.                                         // 1432
 * @param {number} loc The location to search around.                                         // 1433
 * @return {number} Best match index or -1.                                                   // 1434
 * @private                                                                                   // 1435
 */                                                                                           // 1436
diff_match_patch.prototype.match_bitap_ = function(text, pattern, loc) {                      // 1437
  if (pattern.length > this.Match_MaxBits) {                                                  // 1438
    throw new Error('Pattern too long for this browser.');                                    // 1439
  }                                                                                           // 1440
                                                                                              // 1441
  // Initialise the alphabet.                                                                 // 1442
  var s = this.match_alphabet_(pattern);                                                      // 1443
                                                                                              // 1444
  var dmp = this;  // 'this' becomes 'window' in a closure.                                   // 1445
                                                                                              // 1446
  /**                                                                                         // 1447
   * Compute and return the score for a match with e errors and x location.                   // 1448
   * Accesses loc and pattern through being a closure.                                        // 1449
   * @param {number} e Number of errors in match.                                             // 1450
   * @param {number} x Location of match.                                                     // 1451
   * @return {number} Overall score for match (0.0 = good, 1.0 = bad).                        // 1452
   * @private                                                                                 // 1453
   */                                                                                         // 1454
  function match_bitapScore_(e, x) {                                                          // 1455
    var accuracy = e / pattern.length;                                                        // 1456
    var proximity = Math.abs(loc - x);                                                        // 1457
    if (!dmp.Match_Distance) {                                                                // 1458
      // Dodge divide by zero error.                                                          // 1459
      return proximity ? 1.0 : accuracy;                                                      // 1460
    }                                                                                         // 1461
    return accuracy + (proximity / dmp.Match_Distance);                                       // 1462
  }                                                                                           // 1463
                                                                                              // 1464
  // Highest score beyond which we give up.                                                   // 1465
  var score_threshold = this.Match_Threshold;                                                 // 1466
  // Is there a nearby exact match? (speedup)                                                 // 1467
  var best_loc = text.indexOf(pattern, loc);                                                  // 1468
  if (best_loc != -1) {                                                                       // 1469
    score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);              // 1470
    // What about in the other direction? (speedup)                                           // 1471
    best_loc = text.lastIndexOf(pattern, loc + pattern.length);                               // 1472
    if (best_loc != -1) {                                                                     // 1473
      score_threshold =                                                                       // 1474
          Math.min(match_bitapScore_(0, best_loc), score_threshold);                          // 1475
    }                                                                                         // 1476
  }                                                                                           // 1477
                                                                                              // 1478
  // Initialise the bit arrays.                                                               // 1479
  var matchmask = 1 << (pattern.length - 1);                                                  // 1480
  best_loc = -1;                                                                              // 1481
                                                                                              // 1482
  var bin_min, bin_mid;                                                                       // 1483
  var bin_max = pattern.length + text.length;                                                 // 1484
  var last_rd;                                                                                // 1485
  for (var d = 0; d < pattern.length; d++) {                                                  // 1486
    // Scan for the best match; each iteration allows for one more error.                     // 1487
    // Run a binary search to determine how far from 'loc' we can stray at this               // 1488
    // error level.                                                                           // 1489
    bin_min = 0;                                                                              // 1490
    bin_mid = bin_max;                                                                        // 1491
    while (bin_min < bin_mid) {                                                               // 1492
      if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {                           // 1493
        bin_min = bin_mid;                                                                    // 1494
      } else {                                                                                // 1495
        bin_max = bin_mid;                                                                    // 1496
      }                                                                                       // 1497
      bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);                                // 1498
    }                                                                                         // 1499
    // Use the result from this iteration as the maximum for the next.                        // 1500
    bin_max = bin_mid;                                                                        // 1501
    var start = Math.max(1, loc - bin_mid + 1);                                               // 1502
    var finish = Math.min(loc + bin_mid, text.length) + pattern.length;                       // 1503
                                                                                              // 1504
    var rd = Array(finish + 2);                                                               // 1505
    rd[finish + 1] = (1 << d) - 1;                                                            // 1506
    for (var j = finish; j >= start; j--) {                                                   // 1507
      // The alphabet (s) is a sparse hash, so the following line generates                   // 1508
      // warnings.                                                                            // 1509
      var charMatch = s[text.charAt(j - 1)];                                                  // 1510
      if (d === 0) {  // First pass: exact match.                                             // 1511
        rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;                                           // 1512
      } else {  // Subsequent passes: fuzzy match.                                            // 1513
        rd[j] = (((rd[j + 1] << 1) | 1) & charMatch) |                                        // 1514
                (((last_rd[j + 1] | last_rd[j]) << 1) | 1) |                                  // 1515
                last_rd[j + 1];                                                               // 1516
      }                                                                                       // 1517
      if (rd[j] & matchmask) {                                                                // 1518
        var score = match_bitapScore_(d, j - 1);                                              // 1519
        // This match will almost certainly be better than any existing match.                // 1520
        // But check anyway.                                                                  // 1521
        if (score <= score_threshold) {                                                       // 1522
          // Told you so.                                                                     // 1523
          score_threshold = score;                                                            // 1524
          best_loc = j - 1;                                                                   // 1525
          if (best_loc > loc) {                                                               // 1526
            // When passing loc, don't exceed our current distance from loc.                  // 1527
            start = Math.max(1, 2 * loc - best_loc);                                          // 1528
          } else {                                                                            // 1529
            // Already passed loc, downhill from here on in.                                  // 1530
            break;                                                                            // 1531
          }                                                                                   // 1532
        }                                                                                     // 1533
      }                                                                                       // 1534
    }                                                                                         // 1535
    // No hope for a (better) match at greater error levels.                                  // 1536
    if (match_bitapScore_(d + 1, loc) > score_threshold) {                                    // 1537
      break;                                                                                  // 1538
    }                                                                                         // 1539
    last_rd = rd;                                                                             // 1540
  }                                                                                           // 1541
  return best_loc;                                                                            // 1542
};                                                                                            // 1543
                                                                                              // 1544
                                                                                              // 1545
/**                                                                                           // 1546
 * Initialise the alphabet for the Bitap algorithm.                                           // 1547
 * @param {string} pattern The text to encode.                                                // 1548
 * @return {!Object} Hash of character locations.                                             // 1549
 * @private                                                                                   // 1550
 */                                                                                           // 1551
diff_match_patch.prototype.match_alphabet_ = function(pattern) {                              // 1552
  var s = {};                                                                                 // 1553
  for (var i = 0; i < pattern.length; i++) {                                                  // 1554
    s[pattern.charAt(i)] = 0;                                                                 // 1555
  }                                                                                           // 1556
  for (var i = 0; i < pattern.length; i++) {                                                  // 1557
    s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);                                    // 1558
  }                                                                                           // 1559
  return s;                                                                                   // 1560
};                                                                                            // 1561
                                                                                              // 1562
                                                                                              // 1563
//  PATCH FUNCTIONS                                                                           // 1564
                                                                                              // 1565
                                                                                              // 1566
/**                                                                                           // 1567
 * Increase the context until it is unique,                                                   // 1568
 * but don't let the pattern expand beyond Match_MaxBits.                                     // 1569
 * @param {!diff_match_patch.patch_obj} patch The patch to grow.                              // 1570
 * @param {string} text Source text.                                                          // 1571
 * @private                                                                                   // 1572
 */                                                                                           // 1573
diff_match_patch.prototype.patch_addContext_ = function(patch, text) {                        // 1574
  if (text.length == 0) {                                                                     // 1575
    return;                                                                                   // 1576
  }                                                                                           // 1577
  var pattern = text.substring(patch.start2, patch.start2 + patch.length1);                   // 1578
  var padding = 0;                                                                            // 1579
                                                                                              // 1580
  // Look for the first and last matches of pattern in text.  If two different                // 1581
  // matches are found, increase the pattern length.                                          // 1582
  while (text.indexOf(pattern) != text.lastIndexOf(pattern) &&                                // 1583
         pattern.length < this.Match_MaxBits - this.Patch_Margin -                            // 1584
         this.Patch_Margin) {                                                                 // 1585
    padding += this.Patch_Margin;                                                             // 1586
    pattern = text.substring(patch.start2 - padding,                                          // 1587
                             patch.start2 + patch.length1 + padding);                         // 1588
  }                                                                                           // 1589
  // Add one chunk for good luck.                                                             // 1590
  padding += this.Patch_Margin;                                                               // 1591
                                                                                              // 1592
  // Add the prefix.                                                                          // 1593
  var prefix = text.substring(patch.start2 - padding, patch.start2);                          // 1594
  if (prefix) {                                                                               // 1595
    patch.diffs.unshift([DIFF_EQUAL, prefix]);                                                // 1596
  }                                                                                           // 1597
  // Add the suffix.                                                                          // 1598
  var suffix = text.substring(patch.start2 + patch.length1,                                   // 1599
                              patch.start2 + patch.length1 + padding);                        // 1600
  if (suffix) {                                                                               // 1601
    patch.diffs.push([DIFF_EQUAL, suffix]);                                                   // 1602
  }                                                                                           // 1603
                                                                                              // 1604
  // Roll back the start points.                                                              // 1605
  patch.start1 -= prefix.length;                                                              // 1606
  patch.start2 -= prefix.length;                                                              // 1607
  // Extend the lengths.                                                                      // 1608
  patch.length1 += prefix.length + suffix.length;                                             // 1609
  patch.length2 += prefix.length + suffix.length;                                             // 1610
};                                                                                            // 1611
                                                                                              // 1612
                                                                                              // 1613
/**                                                                                           // 1614
 * Compute a list of patches to turn text1 into text2.                                        // 1615
 * Use diffs if provided, otherwise compute it ourselves.                                     // 1616
 * There are four ways to call this function, depending on what data is                       // 1617
 * available to the caller:                                                                   // 1618
 * Method 1:                                                                                  // 1619
 * a = text1, b = text2                                                                       // 1620
 * Method 2:                                                                                  // 1621
 * a = diffs                                                                                  // 1622
 * Method 3 (optimal):                                                                        // 1623
 * a = text1, b = diffs                                                                       // 1624
 * Method 4 (deprecated, use method 3):                                                       // 1625
 * a = text1, b = text2, c = diffs                                                            // 1626
 *                                                                                            // 1627
 * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or                 // 1628
 * Array of diff tuples for text1 to text2 (method 2).                                        // 1629
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_b text2 (methods 1,4) or               // 1630
 * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).                // 1631
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_c Array of diff tuples                 // 1632
 * for text1 to text2 (method 4) or undefined (methods 1,2,3).                                // 1633
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 1634
 */                                                                                           // 1635
diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {                           // 1636
  var text1, diffs;                                                                           // 1637
  if (typeof a == 'string' && typeof opt_b == 'string' &&                                     // 1638
      typeof opt_c == 'undefined') {                                                          // 1639
    // Method 1: text1, text2                                                                 // 1640
    // Compute diffs from text1 and text2.                                                    // 1641
    text1 = /** @type {string} */(a);                                                         // 1642
    diffs = this.diff_main(text1, /** @type {string} */(opt_b), true);                        // 1643
    if (diffs.length > 2) {                                                                   // 1644
      this.diff_cleanupSemantic(diffs);                                                       // 1645
      this.diff_cleanupEfficiency(diffs);                                                     // 1646
    }                                                                                         // 1647
  } else if (a && typeof a == 'object' && typeof opt_b == 'undefined' &&                      // 1648
      typeof opt_c == 'undefined') {                                                          // 1649
    // Method 2: diffs                                                                        // 1650
    // Compute text1 from diffs.                                                              // 1651
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(a);                                // 1652
    text1 = this.diff_text1(diffs);                                                           // 1653
  } else if (typeof a == 'string' && opt_b && typeof opt_b == 'object' &&                     // 1654
      typeof opt_c == 'undefined') {                                                          // 1655
    // Method 3: text1, diffs                                                                 // 1656
    text1 = /** @type {string} */(a);                                                         // 1657
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_b);                            // 1658
  } else if (typeof a == 'string' && typeof opt_b == 'string' &&                              // 1659
      opt_c && typeof opt_c == 'object') {                                                    // 1660
    // Method 4: text1, text2, diffs                                                          // 1661
    // text2 is not used.                                                                     // 1662
    text1 = /** @type {string} */(a);                                                         // 1663
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_c);                            // 1664
  } else {                                                                                    // 1665
    throw new Error('Unknown call format to patch_make.');                                    // 1666
  }                                                                                           // 1667
                                                                                              // 1668
  if (diffs.length === 0) {                                                                   // 1669
    return [];  // Get rid of the null case.                                                  // 1670
  }                                                                                           // 1671
  var patches = [];                                                                           // 1672
  var patch = new diff_match_patch.patch_obj();                                               // 1673
  var patchDiffLength = 0;  // Keeping our own length var is faster in JS.                    // 1674
  var char_count1 = 0;  // Number of characters into the text1 string.                        // 1675
  var char_count2 = 0;  // Number of characters into the text2 string.                        // 1676
  // Start with text1 (prepatch_text) and apply the diffs until we arrive at                  // 1677
  // text2 (postpatch_text).  We recreate the patches one by one to determine                 // 1678
  // context info.                                                                            // 1679
  var prepatch_text = text1;                                                                  // 1680
  var postpatch_text = text1;                                                                 // 1681
  for (var x = 0; x < diffs.length; x++) {                                                    // 1682
    var diff_type = diffs[x][0];                                                              // 1683
    var diff_text = diffs[x][1];                                                              // 1684
                                                                                              // 1685
    if (!patchDiffLength && diff_type !== DIFF_EQUAL) {                                       // 1686
      // A new patch starts here.                                                             // 1687
      patch.start1 = char_count1;                                                             // 1688
      patch.start2 = char_count2;                                                             // 1689
    }                                                                                         // 1690
                                                                                              // 1691
    switch (diff_type) {                                                                      // 1692
      case DIFF_INSERT:                                                                       // 1693
        patch.diffs[patchDiffLength++] = diffs[x];                                            // 1694
        patch.length2 += diff_text.length;                                                    // 1695
        postpatch_text = postpatch_text.substring(0, char_count2) + diff_text +               // 1696
                         postpatch_text.substring(char_count2);                               // 1697
        break;                                                                                // 1698
      case DIFF_DELETE:                                                                       // 1699
        patch.length1 += diff_text.length;                                                    // 1700
        patch.diffs[patchDiffLength++] = diffs[x];                                            // 1701
        postpatch_text = postpatch_text.substring(0, char_count2) +                           // 1702
                         postpatch_text.substring(char_count2 +                               // 1703
                             diff_text.length);                                               // 1704
        break;                                                                                // 1705
      case DIFF_EQUAL:                                                                        // 1706
        if (diff_text.length <= 2 * this.Patch_Margin &&                                      // 1707
            patchDiffLength && diffs.length != x + 1) {                                       // 1708
          // Small equality inside a patch.                                                   // 1709
          patch.diffs[patchDiffLength++] = diffs[x];                                          // 1710
          patch.length1 += diff_text.length;                                                  // 1711
          patch.length2 += diff_text.length;                                                  // 1712
        } else if (diff_text.length >= 2 * this.Patch_Margin) {                               // 1713
          // Time for a new patch.                                                            // 1714
          if (patchDiffLength) {                                                              // 1715
            this.patch_addContext_(patch, prepatch_text);                                     // 1716
            patches.push(patch);                                                              // 1717
            patch = new diff_match_patch.patch_obj();                                         // 1718
            patchDiffLength = 0;                                                              // 1719
            // Unlike Unidiff, our patch lists have a rolling context.                        // 1720
            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff                  // 1721
            // Update prepatch text & pos to reflect the application of the                   // 1722
            // just completed patch.                                                          // 1723
            prepatch_text = postpatch_text;                                                   // 1724
            char_count1 = char_count2;                                                        // 1725
          }                                                                                   // 1726
        }                                                                                     // 1727
        break;                                                                                // 1728
    }                                                                                         // 1729
                                                                                              // 1730
    // Update the current character count.                                                    // 1731
    if (diff_type !== DIFF_INSERT) {                                                          // 1732
      char_count1 += diff_text.length;                                                        // 1733
    }                                                                                         // 1734
    if (diff_type !== DIFF_DELETE) {                                                          // 1735
      char_count2 += diff_text.length;                                                        // 1736
    }                                                                                         // 1737
  }                                                                                           // 1738
  // Pick up the leftover patch if not empty.                                                 // 1739
  if (patchDiffLength) {                                                                      // 1740
    this.patch_addContext_(patch, prepatch_text);                                             // 1741
    patches.push(patch);                                                                      // 1742
  }                                                                                           // 1743
                                                                                              // 1744
  return patches;                                                                             // 1745
};                                                                                            // 1746
                                                                                              // 1747
                                                                                              // 1748
/**                                                                                           // 1749
 * Given an array of patches, return another array that is identical.                         // 1750
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1751
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 1752
 */                                                                                           // 1753
diff_match_patch.prototype.patch_deepCopy = function(patches) {                               // 1754
  // Making deep copies is hard in JavaScript.                                                // 1755
  var patchesCopy = [];                                                                       // 1756
  for (var x = 0; x < patches.length; x++) {                                                  // 1757
    var patch = patches[x];                                                                   // 1758
    var patchCopy = new diff_match_patch.patch_obj();                                         // 1759
    patchCopy.diffs = [];                                                                     // 1760
    for (var y = 0; y < patch.diffs.length; y++) {                                            // 1761
      patchCopy.diffs[y] = patch.diffs[y].slice();                                            // 1762
    }                                                                                         // 1763
    patchCopy.start1 = patch.start1;                                                          // 1764
    patchCopy.start2 = patch.start2;                                                          // 1765
    patchCopy.length1 = patch.length1;                                                        // 1766
    patchCopy.length2 = patch.length2;                                                        // 1767
    patchesCopy[x] = patchCopy;                                                               // 1768
  }                                                                                           // 1769
  return patchesCopy;                                                                         // 1770
};                                                                                            // 1771
                                                                                              // 1772
                                                                                              // 1773
/**                                                                                           // 1774
 * Merge a set of patches onto the text.  Return a patched text, as well                      // 1775
 * as a list of true/false values indicating which patches were applied.                      // 1776
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1777
 * @param {string} text Old text.                                                             // 1778
 * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the               // 1779
 *      new text and an array of boolean values.                                              // 1780
 */                                                                                           // 1781
diff_match_patch.prototype.patch_apply = function(patches, text) {                            // 1782
  if (patches.length == 0) {                                                                  // 1783
    return [text, []];                                                                        // 1784
  }                                                                                           // 1785
                                                                                              // 1786
  // Deep copy the patches so that no changes are made to originals.                          // 1787
  patches = this.patch_deepCopy(patches);                                                     // 1788
                                                                                              // 1789
  var nullPadding = this.patch_addPadding(patches);                                           // 1790
  text = nullPadding + text + nullPadding;                                                    // 1791
                                                                                              // 1792
  this.patch_splitMax(patches);                                                               // 1793
  // delta keeps track of the offset between the expected and actual location                 // 1794
  // of the previous patch.  If there are patches expected at positions 10 and                // 1795
  // 20, but the first patch was found at 12, delta is 2 and the second patch                 // 1796
  // has an effective expected position of 22.                                                // 1797
  var delta = 0;                                                                              // 1798
  var results = [];                                                                           // 1799
  for (var x = 0; x < patches.length; x++) {                                                  // 1800
    var expected_loc = patches[x].start2 + delta;                                             // 1801
    var text1 = this.diff_text1(patches[x].diffs);                                            // 1802
    var start_loc;                                                                            // 1803
    var end_loc = -1;                                                                         // 1804
    if (text1.length > this.Match_MaxBits) {                                                  // 1805
      // patch_splitMax will only provide an oversized pattern in the case of                 // 1806
      // a monster delete.                                                                    // 1807
      start_loc = this.match_main(text, text1.substring(0, this.Match_MaxBits),               // 1808
                                  expected_loc);                                              // 1809
      if (start_loc != -1) {                                                                  // 1810
        end_loc = this.match_main(text,                                                       // 1811
            text1.substring(text1.length - this.Match_MaxBits),                               // 1812
            expected_loc + text1.length - this.Match_MaxBits);                                // 1813
        if (end_loc == -1 || start_loc >= end_loc) {                                          // 1814
          // Can't find valid trailing context.  Drop this patch.                             // 1815
          start_loc = -1;                                                                     // 1816
        }                                                                                     // 1817
      }                                                                                       // 1818
    } else {                                                                                  // 1819
      start_loc = this.match_main(text, text1, expected_loc);                                 // 1820
    }                                                                                         // 1821
    if (start_loc == -1) {                                                                    // 1822
      // No match found.  :(                                                                  // 1823
      results[x] = false;                                                                     // 1824
      // Subtract the delta for this failed patch from subsequent patches.                    // 1825
      delta -= patches[x].length2 - patches[x].length1;                                       // 1826
    } else {                                                                                  // 1827
      // Found a match.  :)                                                                   // 1828
      results[x] = true;                                                                      // 1829
      delta = start_loc - expected_loc;                                                       // 1830
      var text2;                                                                              // 1831
      if (end_loc == -1) {                                                                    // 1832
        text2 = text.substring(start_loc, start_loc + text1.length);                          // 1833
      } else {                                                                                // 1834
        text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);                      // 1835
      }                                                                                       // 1836
      if (text1 == text2) {                                                                   // 1837
        // Perfect match, just shove the replacement text in.                                 // 1838
        text = text.substring(0, start_loc) +                                                 // 1839
               this.diff_text2(patches[x].diffs) +                                            // 1840
               text.substring(start_loc + text1.length);                                      // 1841
      } else {                                                                                // 1842
        // Imperfect match.  Run a diff to get a framework of equivalent                      // 1843
        // indices.                                                                           // 1844
        var diffs = this.diff_main(text1, text2, false);                                      // 1845
        if (text1.length > this.Match_MaxBits &&                                              // 1846
            this.diff_levenshtein(diffs) / text1.length >                                     // 1847
            this.Patch_DeleteThreshold) {                                                     // 1848
          // The end points match, but the content is unacceptably bad.                       // 1849
          results[x] = false;                                                                 // 1850
        } else {                                                                              // 1851
          this.diff_cleanupSemanticLossless(diffs);                                           // 1852
          var index1 = 0;                                                                     // 1853
          var index2;                                                                         // 1854
          for (var y = 0; y < patches[x].diffs.length; y++) {                                 // 1855
            var mod = patches[x].diffs[y];                                                    // 1856
            if (mod[0] !== DIFF_EQUAL) {                                                      // 1857
              index2 = this.diff_xIndex(diffs, index1);                                       // 1858
            }                                                                                 // 1859
            if (mod[0] === DIFF_INSERT) {  // Insertion                                       // 1860
              text = text.substring(0, start_loc + index2) + mod[1] +                         // 1861
                     text.substring(start_loc + index2);                                      // 1862
            } else if (mod[0] === DIFF_DELETE) {  // Deletion                                 // 1863
              text = text.substring(0, start_loc + index2) +                                  // 1864
                     text.substring(start_loc + this.diff_xIndex(diffs,                       // 1865
                         index1 + mod[1].length));                                            // 1866
            }                                                                                 // 1867
            if (mod[0] !== DIFF_DELETE) {                                                     // 1868
              index1 += mod[1].length;                                                        // 1869
            }                                                                                 // 1870
          }                                                                                   // 1871
        }                                                                                     // 1872
      }                                                                                       // 1873
    }                                                                                         // 1874
  }                                                                                           // 1875
  // Strip the padding off.                                                                   // 1876
  text = text.substring(nullPadding.length, text.length - nullPadding.length);                // 1877
  return [text, results];                                                                     // 1878
};                                                                                            // 1879
                                                                                              // 1880
                                                                                              // 1881
/**                                                                                           // 1882
 * Add some padding on text start and end so that edges can match something.                  // 1883
 * Intended to be called only from within patch_apply.                                        // 1884
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1885
 * @return {string} The padding string added to each side.                                    // 1886
 */                                                                                           // 1887
diff_match_patch.prototype.patch_addPadding = function(patches) {                             // 1888
  var paddingLength = this.Patch_Margin;                                                      // 1889
  var nullPadding = '';                                                                       // 1890
  for (var x = 1; x <= paddingLength; x++) {                                                  // 1891
    nullPadding += String.fromCharCode(x);                                                    // 1892
  }                                                                                           // 1893
                                                                                              // 1894
  // Bump all the patches forward.                                                            // 1895
  for (var x = 0; x < patches.length; x++) {                                                  // 1896
    patches[x].start1 += paddingLength;                                                       // 1897
    patches[x].start2 += paddingLength;                                                       // 1898
  }                                                                                           // 1899
                                                                                              // 1900
  // Add some padding on start of first diff.                                                 // 1901
  var patch = patches[0];                                                                     // 1902
  var diffs = patch.diffs;                                                                    // 1903
  if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {                                       // 1904
    // Add nullPadding equality.                                                              // 1905
    diffs.unshift([DIFF_EQUAL, nullPadding]);                                                 // 1906
    patch.start1 -= paddingLength;  // Should be 0.                                           // 1907
    patch.start2 -= paddingLength;  // Should be 0.                                           // 1908
    patch.length1 += paddingLength;                                                           // 1909
    patch.length2 += paddingLength;                                                           // 1910
  } else if (paddingLength > diffs[0][1].length) {                                            // 1911
    // Grow first equality.                                                                   // 1912
    var extraLength = paddingLength - diffs[0][1].length;                                     // 1913
    diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];                    // 1914
    patch.start1 -= extraLength;                                                              // 1915
    patch.start2 -= extraLength;                                                              // 1916
    patch.length1 += extraLength;                                                             // 1917
    patch.length2 += extraLength;                                                             // 1918
  }                                                                                           // 1919
                                                                                              // 1920
  // Add some padding on end of last diff.                                                    // 1921
  patch = patches[patches.length - 1];                                                        // 1922
  diffs = patch.diffs;                                                                        // 1923
  if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {                        // 1924
    // Add nullPadding equality.                                                              // 1925
    diffs.push([DIFF_EQUAL, nullPadding]);                                                    // 1926
    patch.length1 += paddingLength;                                                           // 1927
    patch.length2 += paddingLength;                                                           // 1928
  } else if (paddingLength > diffs[diffs.length - 1][1].length) {                             // 1929
    // Grow last equality.                                                                    // 1930
    var extraLength = paddingLength - diffs[diffs.length - 1][1].length;                      // 1931
    diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);                      // 1932
    patch.length1 += extraLength;                                                             // 1933
    patch.length2 += extraLength;                                                             // 1934
  }                                                                                           // 1935
                                                                                              // 1936
  return nullPadding;                                                                         // 1937
};                                                                                            // 1938
                                                                                              // 1939
                                                                                              // 1940
/**                                                                                           // 1941
 * Look through the patches and break up any which are longer than the maximum                // 1942
 * limit of the match algorithm.                                                              // 1943
 * Intended to be called only from within patch_apply.                                        // 1944
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1945
 */                                                                                           // 1946
diff_match_patch.prototype.patch_splitMax = function(patches) {                               // 1947
  var patch_size = this.Match_MaxBits;                                                        // 1948
  for (var x = 0; x < patches.length; x++) {                                                  // 1949
    if (patches[x].length1 <= patch_size) {                                                   // 1950
      continue;                                                                               // 1951
    }                                                                                         // 1952
    var bigpatch = patches[x];                                                                // 1953
    // Remove the big old patch.                                                              // 1954
    patches.splice(x--, 1);                                                                   // 1955
    var start1 = bigpatch.start1;                                                             // 1956
    var start2 = bigpatch.start2;                                                             // 1957
    var precontext = '';                                                                      // 1958
    while (bigpatch.diffs.length !== 0) {                                                     // 1959
      // Create one of several smaller patches.                                               // 1960
      var patch = new diff_match_patch.patch_obj();                                           // 1961
      var empty = true;                                                                       // 1962
      patch.start1 = start1 - precontext.length;                                              // 1963
      patch.start2 = start2 - precontext.length;                                              // 1964
      if (precontext !== '') {                                                                // 1965
        patch.length1 = patch.length2 = precontext.length;                                    // 1966
        patch.diffs.push([DIFF_EQUAL, precontext]);                                           // 1967
      }                                                                                       // 1968
      while (bigpatch.diffs.length !== 0 &&                                                   // 1969
             patch.length1 < patch_size - this.Patch_Margin) {                                // 1970
        var diff_type = bigpatch.diffs[0][0];                                                 // 1971
        var diff_text = bigpatch.diffs[0][1];                                                 // 1972
        if (diff_type === DIFF_INSERT) {                                                      // 1973
          // Insertions are harmless.                                                         // 1974
          patch.length2 += diff_text.length;                                                  // 1975
          start2 += diff_text.length;                                                         // 1976
          patch.diffs.push(bigpatch.diffs.shift());                                           // 1977
          empty = false;                                                                      // 1978
        } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 &&                    // 1979
                   patch.diffs[0][0] == DIFF_EQUAL &&                                         // 1980
                   diff_text.length > 2 * patch_size) {                                       // 1981
          // This is a large deletion.  Let it pass in one chunk.                             // 1982
          patch.length1 += diff_text.length;                                                  // 1983
          start1 += diff_text.length;                                                         // 1984
          empty = false;                                                                      // 1985
          patch.diffs.push([diff_type, diff_text]);                                           // 1986
          bigpatch.diffs.shift();                                                             // 1987
        } else {                                                                              // 1988
          // Deletion or equality.  Only take as much as we can stomach.                      // 1989
          diff_text = diff_text.substring(0,                                                  // 1990
              patch_size - patch.length1 - this.Patch_Margin);                                // 1991
          patch.length1 += diff_text.length;                                                  // 1992
          start1 += diff_text.length;                                                         // 1993
          if (diff_type === DIFF_EQUAL) {                                                     // 1994
            patch.length2 += diff_text.length;                                                // 1995
            start2 += diff_text.length;                                                       // 1996
          } else {                                                                            // 1997
            empty = false;                                                                    // 1998
          }                                                                                   // 1999
          patch.diffs.push([diff_type, diff_text]);                                           // 2000
          if (diff_text == bigpatch.diffs[0][1]) {                                            // 2001
            bigpatch.diffs.shift();                                                           // 2002
          } else {                                                                            // 2003
            bigpatch.diffs[0][1] =                                                            // 2004
                bigpatch.diffs[0][1].substring(diff_text.length);                             // 2005
          }                                                                                   // 2006
        }                                                                                     // 2007
      }                                                                                       // 2008
      // Compute the head context for the next patch.                                         // 2009
      precontext = this.diff_text2(patch.diffs);                                              // 2010
      precontext =                                                                            // 2011
          precontext.substring(precontext.length - this.Patch_Margin);                        // 2012
      // Append the end context for this patch.                                               // 2013
      var postcontext = this.diff_text1(bigpatch.diffs)                                       // 2014
                            .substring(0, this.Patch_Margin);                                 // 2015
      if (postcontext !== '') {                                                               // 2016
        patch.length1 += postcontext.length;                                                  // 2017
        patch.length2 += postcontext.length;                                                  // 2018
        if (patch.diffs.length !== 0 &&                                                       // 2019
            patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {                          // 2020
          patch.diffs[patch.diffs.length - 1][1] += postcontext;                              // 2021
        } else {                                                                              // 2022
          patch.diffs.push([DIFF_EQUAL, postcontext]);                                        // 2023
        }                                                                                     // 2024
      }                                                                                       // 2025
      if (!empty) {                                                                           // 2026
        patches.splice(++x, 0, patch);                                                        // 2027
      }                                                                                       // 2028
    }                                                                                         // 2029
  }                                                                                           // 2030
};                                                                                            // 2031
                                                                                              // 2032
                                                                                              // 2033
/**                                                                                           // 2034
 * Take a list of patches and return a textual representation.                                // 2035
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 2036
 * @return {string} Text representation of patches.                                           // 2037
 */                                                                                           // 2038
diff_match_patch.prototype.patch_toText = function(patches) {                                 // 2039
  var text = [];                                                                              // 2040
  for (var x = 0; x < patches.length; x++) {                                                  // 2041
    text[x] = patches[x];                                                                     // 2042
  }                                                                                           // 2043
  return text.join('');                                                                       // 2044
};                                                                                            // 2045
                                                                                              // 2046
                                                                                              // 2047
/**                                                                                           // 2048
 * Parse a textual representation of patches and return a list of Patch objects.              // 2049
 * @param {string} textline Text representation of patches.                                   // 2050
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 2051
 * @throws {!Error} If invalid input.                                                         // 2052
 */                                                                                           // 2053
diff_match_patch.prototype.patch_fromText = function(textline) {                              // 2054
  var patches = [];                                                                           // 2055
  if (!textline) {                                                                            // 2056
    return patches;                                                                           // 2057
  }                                                                                           // 2058
  var text = textline.split('\n');                                                            // 2059
  var textPointer = 0;                                                                        // 2060
  var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;                                   // 2061
  while (textPointer < text.length) {                                                         // 2062
    var m = text[textPointer].match(patchHeader);                                             // 2063
    if (!m) {                                                                                 // 2064
      throw new Error('Invalid patch string: ' + text[textPointer]);                          // 2065
    }                                                                                         // 2066
    var patch = new diff_match_patch.patch_obj();                                             // 2067
    patches.push(patch);                                                                      // 2068
    patch.start1 = parseInt(m[1], 10);                                                        // 2069
    if (m[2] === '') {                                                                        // 2070
      patch.start1--;                                                                         // 2071
      patch.length1 = 1;                                                                      // 2072
    } else if (m[2] == '0') {                                                                 // 2073
      patch.length1 = 0;                                                                      // 2074
    } else {                                                                                  // 2075
      patch.start1--;                                                                         // 2076
      patch.length1 = parseInt(m[2], 10);                                                     // 2077
    }                                                                                         // 2078
                                                                                              // 2079
    patch.start2 = parseInt(m[3], 10);                                                        // 2080
    if (m[4] === '') {                                                                        // 2081
      patch.start2--;                                                                         // 2082
      patch.length2 = 1;                                                                      // 2083
    } else if (m[4] == '0') {                                                                 // 2084
      patch.length2 = 0;                                                                      // 2085
    } else {                                                                                  // 2086
      patch.start2--;                                                                         // 2087
      patch.length2 = parseInt(m[4], 10);                                                     // 2088
    }                                                                                         // 2089
    textPointer++;                                                                            // 2090
                                                                                              // 2091
    while (textPointer < text.length) {                                                       // 2092
      var sign = text[textPointer].charAt(0);                                                 // 2093
      try {                                                                                   // 2094
        var line = decodeURI(text[textPointer].substring(1));                                 // 2095
      } catch (ex) {                                                                          // 2096
        // Malformed URI sequence.                                                            // 2097
        throw new Error('Illegal escape in patch_fromText: ' + line);                         // 2098
      }                                                                                       // 2099
      if (sign == '-') {                                                                      // 2100
        // Deletion.                                                                          // 2101
        patch.diffs.push([DIFF_DELETE, line]);                                                // 2102
      } else if (sign == '+') {                                                               // 2103
        // Insertion.                                                                         // 2104
        patch.diffs.push([DIFF_INSERT, line]);                                                // 2105
      } else if (sign == ' ') {                                                               // 2106
        // Minor equality.                                                                    // 2107
        patch.diffs.push([DIFF_EQUAL, line]);                                                 // 2108
      } else if (sign == '@') {                                                               // 2109
        // Start of next patch.                                                               // 2110
        break;                                                                                // 2111
      } else if (sign === '') {                                                               // 2112
        // Blank line?  Whatever.                                                             // 2113
      } else {                                                                                // 2114
        // WTF?                                                                               // 2115
        throw new Error('Invalid patch mode "' + sign + '" in: ' + line);                     // 2116
      }                                                                                       // 2117
      textPointer++;                                                                          // 2118
    }                                                                                         // 2119
  }                                                                                           // 2120
  return patches;                                                                             // 2121
};                                                                                            // 2122
                                                                                              // 2123
                                                                                              // 2124
/**                                                                                           // 2125
 * Class representing one patch operation.                                                    // 2126
 * @constructor                                                                               // 2127
 */                                                                                           // 2128
diff_match_patch.patch_obj = function() {                                                     // 2129
  /** @type {!Array.<!diff_match_patch.Diff>} */                                              // 2130
  this.diffs = [];                                                                            // 2131
  /** @type {?number} */                                                                      // 2132
  this.start1 = null;                                                                         // 2133
  /** @type {?number} */                                                                      // 2134
  this.start2 = null;                                                                         // 2135
  /** @type {number} */                                                                       // 2136
  this.length1 = 0;                                                                           // 2137
  /** @type {number} */                                                                       // 2138
  this.length2 = 0;                                                                           // 2139
};                                                                                            // 2140
                                                                                              // 2141
                                                                                              // 2142
/**                                                                                           // 2143
 * Emmulate GNU diff's format.                                                                // 2144
 * Header: @@ -382,8 +481,9 @@                                                                // 2145
 * Indicies are printed as 1-based, not 0-based.                                              // 2146
 * @return {string} The GNU diff string.                                                      // 2147
 */                                                                                           // 2148
diff_match_patch.patch_obj.prototype.toString = function() {                                  // 2149
  var coords1, coords2;                                                                       // 2150
  if (this.length1 === 0) {                                                                   // 2151
    coords1 = this.start1 + ',0';                                                             // 2152
  } else if (this.length1 == 1) {                                                             // 2153
    coords1 = this.start1 + 1;                                                                // 2154
  } else {                                                                                    // 2155
    coords1 = (this.start1 + 1) + ',' + this.length1;                                         // 2156
  }                                                                                           // 2157
  if (this.length2 === 0) {                                                                   // 2158
    coords2 = this.start2 + ',0';                                                             // 2159
  } else if (this.length2 == 1) {                                                             // 2160
    coords2 = this.start2 + 1;                                                                // 2161
  } else {                                                                                    // 2162
    coords2 = (this.start2 + 1) + ',' + this.length2;                                         // 2163
  }                                                                                           // 2164
  var text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];                                   // 2165
  var op;                                                                                     // 2166
  // Escape the body of the patch with %xx notation.                                          // 2167
  for (var x = 0; x < this.diffs.length; x++) {                                               // 2168
    switch (this.diffs[x][0]) {                                                               // 2169
      case DIFF_INSERT:                                                                       // 2170
        op = '+';                                                                             // 2171
        break;                                                                                // 2172
      case DIFF_DELETE:                                                                       // 2173
        op = '-';                                                                             // 2174
        break;                                                                                // 2175
      case DIFF_EQUAL:                                                                        // 2176
        op = ' ';                                                                             // 2177
        break;                                                                                // 2178
    }                                                                                         // 2179
    text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';                                    // 2180
  }                                                                                           // 2181
  return text.join('').replace(/%20/g, ' ');                                                  // 2182
};                                                                                            // 2183
                                                                                              // 2184
                                                                                              // 2185
// Export these global variables so that they survive Google's JS compiler.                   // 2186
// In a browser, 'this' will be 'window'.                                                     // 2187
// Users of node.js should 'require' the uncompressed version since Google's                  // 2188
// JS compiler may break the following exports for non-browser environments.                  // 2189
this['diff_match_patch'] = diff_match_patch;                                                  // 2190
this['DIFF_DELETE'] = DIFF_DELETE;                                                            // 2191
this['DIFF_INSERT'] = DIFF_INSERT;                                                            // 2192
this['DIFF_EQUAL'] = DIFF_EQUAL;                                                              // 2193
                                                                                              // 2194
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/test-in-browser/diff_match_patch_uncompressed.js                                  //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
/**                                                                                           // 1
 * Diff Match and Patch                                                                       // 2
 *                                                                                            // 3
 * Copyright 2006 Google Inc.                                                                 // 4
 * http://code.google.com/p/google-diff-match-patch/                                          // 5
 *                                                                                            // 6
 * Licensed under the Apache License, Version 2.0 (the "License");                            // 7
 * you may not use this file except in compliance with the License.                           // 8
 * You may obtain a copy of the License at                                                    // 9
 *                                                                                            // 10
 *   http://www.apache.org/licenses/LICENSE-2.0                                               // 11
 *                                                                                            // 12
 * Unless required by applicable law or agreed to in writing, software                        // 13
 * distributed under the License is distributed on an "AS IS" BASIS,                          // 14
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.                   // 15
 * See the License for the specific language governing permissions and                        // 16
 * limitations under the License.                                                             // 17
 */                                                                                           // 18
                                                                                              // 19
/**                                                                                           // 20
 * @fileoverview Computes the difference between two texts to create a patch.                 // 21
 * Applies the patch onto another text, allowing for errors.                                  // 22
 * @author fraser@google.com (Neil Fraser)                                                    // 23
 */                                                                                           // 24
                                                                                              // 25
/**                                                                                           // 26
 * Class containing the diff, match and patch methods.                                        // 27
 * @constructor                                                                               // 28
 */                                                                                           // 29
function diff_match_patch() {                                                                 // 30
                                                                                              // 31
  // Defaults.                                                                                // 32
  // Redefine these in your program to override the defaults.                                 // 33
                                                                                              // 34
  // Number of seconds to map a diff before giving up (0 for infinity).                       // 35
  this.Diff_Timeout = 1.0;                                                                    // 36
  // Cost of an empty edit operation in terms of edit characters.                             // 37
  this.Diff_EditCost = 4;                                                                     // 38
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose).                 // 39
  this.Match_Threshold = 0.5;                                                                 // 40
  // How far to search for a match (0 = exact location, 1000+ = broad match).                 // 41
  // A match this many characters away from the expected location will add                    // 42
  // 1.0 to the score (0.0 is a perfect match).                                               // 43
  this.Match_Distance = 1000;                                                                 // 44
  // When deleting a large block of text (over ~64 characters), how close do                  // 45
  // the contents have to be to match the expected contents. (0.0 = perfection,               // 46
  // 1.0 = very loose).  Note that Match_Threshold controls how closely the                   // 47
  // end points of a delete need to match.                                                    // 48
  this.Patch_DeleteThreshold = 0.5;                                                           // 49
  // Chunk size for context length.                                                           // 50
  this.Patch_Margin = 4;                                                                      // 51
                                                                                              // 52
  // The number of bits in an int.                                                            // 53
  this.Match_MaxBits = 32;                                                                    // 54
}                                                                                             // 55
                                                                                              // 56
                                                                                              // 57
//  DIFF FUNCTIONS                                                                            // 58
                                                                                              // 59
                                                                                              // 60
/**                                                                                           // 61
 * The data structure representing a diff is an array of tuples:                              // 62
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]                // 63
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'                              // 64
 */                                                                                           // 65
var DIFF_DELETE = -1;                                                                         // 66
var DIFF_INSERT = 1;                                                                          // 67
var DIFF_EQUAL = 0;                                                                           // 68
                                                                                              // 69
/** @typedef {{0: number, 1: string}} */                                                      // 70
diff_match_patch.Diff;                                                                        // 71
                                                                                              // 72
                                                                                              // 73
/**                                                                                           // 74
 * Find the differences between two texts.  Simplifies the problem by stripping               // 75
 * any common prefix or suffix off the texts before diffing.                                  // 76
 * @param {string} text1 Old string to be diffed.                                             // 77
 * @param {string} text2 New string to be diffed.                                             // 78
 * @param {boolean=} opt_checklines Optional speedup flag. If present and false,              // 79
 *     then don't run a line-level diff first to identify the changed areas.                  // 80
 *     Defaults to true, which does a faster, slightly less optimal diff.                     // 81
 * @param {number} opt_deadline Optional time when the diff should be complete                // 82
 *     by.  Used internally for recursive calls.  Users should set DiffTimeout                // 83
 *     instead.                                                                               // 84
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 85
 */                                                                                           // 86
diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines,                 // 87
    opt_deadline) {                                                                           // 88
  // Set a deadline by which time the diff must be complete.                                  // 89
  if (typeof opt_deadline == 'undefined') {                                                   // 90
    if (this.Diff_Timeout <= 0) {                                                             // 91
      opt_deadline = Number.MAX_VALUE;                                                        // 92
    } else {                                                                                  // 93
      opt_deadline = (new Date).getTime() + this.Diff_Timeout * 1000;                         // 94
    }                                                                                         // 95
  }                                                                                           // 96
  var deadline = opt_deadline;                                                                // 97
                                                                                              // 98
  // Check for null inputs.                                                                   // 99
  if (text1 == null || text2 == null) {                                                       // 100
    throw new Error('Null input. (diff_main)');                                               // 101
  }                                                                                           // 102
                                                                                              // 103
  // Check for equality (speedup).                                                            // 104
  if (text1 == text2) {                                                                       // 105
    if (text1) {                                                                              // 106
      return [[DIFF_EQUAL, text1]];                                                           // 107
    }                                                                                         // 108
    return [];                                                                                // 109
  }                                                                                           // 110
                                                                                              // 111
  if (typeof opt_checklines == 'undefined') {                                                 // 112
    opt_checklines = true;                                                                    // 113
  }                                                                                           // 114
  var checklines = opt_checklines;                                                            // 115
                                                                                              // 116
  // Trim off common prefix (speedup).                                                        // 117
  var commonlength = this.diff_commonPrefix(text1, text2);                                    // 118
  var commonprefix = text1.substring(0, commonlength);                                        // 119
  text1 = text1.substring(commonlength);                                                      // 120
  text2 = text2.substring(commonlength);                                                      // 121
                                                                                              // 122
  // Trim off common suffix (speedup).                                                        // 123
  commonlength = this.diff_commonSuffix(text1, text2);                                        // 124
  var commonsuffix = text1.substring(text1.length - commonlength);                            // 125
  text1 = text1.substring(0, text1.length - commonlength);                                    // 126
  text2 = text2.substring(0, text2.length - commonlength);                                    // 127
                                                                                              // 128
  // Compute the diff on the middle block.                                                    // 129
  var diffs = this.diff_compute_(text1, text2, checklines, deadline);                         // 130
                                                                                              // 131
  // Restore the prefix and suffix.                                                           // 132
  if (commonprefix) {                                                                         // 133
    diffs.unshift([DIFF_EQUAL, commonprefix]);                                                // 134
  }                                                                                           // 135
  if (commonsuffix) {                                                                         // 136
    diffs.push([DIFF_EQUAL, commonsuffix]);                                                   // 137
  }                                                                                           // 138
  this.diff_cleanupMerge(diffs);                                                              // 139
  return diffs;                                                                               // 140
};                                                                                            // 141
                                                                                              // 142
                                                                                              // 143
/**                                                                                           // 144
 * Find the differences between two texts.  Assumes that the texts do not                     // 145
 * have any common prefix or suffix.                                                          // 146
 * @param {string} text1 Old string to be diffed.                                             // 147
 * @param {string} text2 New string to be diffed.                                             // 148
 * @param {boolean} checklines Speedup flag.  If false, then don't run a                      // 149
 *     line-level diff first to identify the changed areas.                                   // 150
 *     If true, then run a faster, slightly less optimal diff.                                // 151
 * @param {number} deadline Time when the diff should be complete by.                         // 152
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 153
 * @private                                                                                   // 154
 */                                                                                           // 155
diff_match_patch.prototype.diff_compute_ = function(text1, text2, checklines,                 // 156
    deadline) {                                                                               // 157
  var diffs;                                                                                  // 158
                                                                                              // 159
  if (!text1) {                                                                               // 160
    // Just add some text (speedup).                                                          // 161
    return [[DIFF_INSERT, text2]];                                                            // 162
  }                                                                                           // 163
                                                                                              // 164
  if (!text2) {                                                                               // 165
    // Just delete some text (speedup).                                                       // 166
    return [[DIFF_DELETE, text1]];                                                            // 167
  }                                                                                           // 168
                                                                                              // 169
  var longtext = text1.length > text2.length ? text1 : text2;                                 // 170
  var shorttext = text1.length > text2.length ? text2 : text1;                                // 171
  var i = longtext.indexOf(shorttext);                                                        // 172
  if (i != -1) {                                                                              // 173
    // Shorter text is inside the longer text (speedup).                                      // 174
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],                                         // 175
             [DIFF_EQUAL, shorttext],                                                         // 176
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];                        // 177
    // Swap insertions for deletions if diff is reversed.                                     // 178
    if (text1.length > text2.length) {                                                        // 179
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;                                                // 180
    }                                                                                         // 181
    return diffs;                                                                             // 182
  }                                                                                           // 183
                                                                                              // 184
  if (shorttext.length == 1) {                                                                // 185
    // Single character string.                                                               // 186
    // After the previous speedup, the character can't be an equality.                        // 187
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];                                      // 188
  }                                                                                           // 189
                                                                                              // 190
  // Check to see if the problem can be split in two.                                         // 191
  var hm = this.diff_halfMatch_(text1, text2);                                                // 192
  if (hm) {                                                                                   // 193
    // A half-match was found, sort out the return data.                                      // 194
    var text1_a = hm[0];                                                                      // 195
    var text1_b = hm[1];                                                                      // 196
    var text2_a = hm[2];                                                                      // 197
    var text2_b = hm[3];                                                                      // 198
    var mid_common = hm[4];                                                                   // 199
    // Send both pairs off for separate processing.                                           // 200
    var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);                     // 201
    var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);                     // 202
    // Merge the results.                                                                     // 203
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);                               // 204
  }                                                                                           // 205
                                                                                              // 206
  if (checklines && text1.length > 100 && text2.length > 100) {                               // 207
    return this.diff_lineMode_(text1, text2, deadline);                                       // 208
  }                                                                                           // 209
                                                                                              // 210
  return this.diff_bisect_(text1, text2, deadline);                                           // 211
};                                                                                            // 212
                                                                                              // 213
                                                                                              // 214
/**                                                                                           // 215
 * Do a quick line-level diff on both strings, then rediff the parts for                      // 216
 * greater accuracy.                                                                          // 217
 * This speedup can produce non-minimal diffs.                                                // 218
 * @param {string} text1 Old string to be diffed.                                             // 219
 * @param {string} text2 New string to be diffed.                                             // 220
 * @param {number} deadline Time when the diff should be complete by.                         // 221
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 222
 * @private                                                                                   // 223
 */                                                                                           // 224
diff_match_patch.prototype.diff_lineMode_ = function(text1, text2, deadline) {                // 225
  // Scan the text on a line-by-line basis first.                                             // 226
  var a = this.diff_linesToChars_(text1, text2);                                              // 227
  text1 = a.chars1;                                                                           // 228
  text2 = a.chars2;                                                                           // 229
  var linearray = a.lineArray;                                                                // 230
                                                                                              // 231
  var diffs = this.diff_main(text1, text2, false, deadline);                                  // 232
                                                                                              // 233
  // Convert the diff back to original text.                                                  // 234
  this.diff_charsToLines_(diffs, linearray);                                                  // 235
  // Eliminate freak matches (e.g. blank lines)                                               // 236
  this.diff_cleanupSemantic(diffs);                                                           // 237
                                                                                              // 238
  // Rediff any replacement blocks, this time character-by-character.                         // 239
  // Add a dummy entry at the end.                                                            // 240
  diffs.push([DIFF_EQUAL, '']);                                                               // 241
  var pointer = 0;                                                                            // 242
  var count_delete = 0;                                                                       // 243
  var count_insert = 0;                                                                       // 244
  var text_delete = '';                                                                       // 245
  var text_insert = '';                                                                       // 246
  while (pointer < diffs.length) {                                                            // 247
    switch (diffs[pointer][0]) {                                                              // 248
      case DIFF_INSERT:                                                                       // 249
        count_insert++;                                                                       // 250
        text_insert += diffs[pointer][1];                                                     // 251
        break;                                                                                // 252
      case DIFF_DELETE:                                                                       // 253
        count_delete++;                                                                       // 254
        text_delete += diffs[pointer][1];                                                     // 255
        break;                                                                                // 256
      case DIFF_EQUAL:                                                                        // 257
        // Upon reaching an equality, check for prior redundancies.                           // 258
        if (count_delete >= 1 && count_insert >= 1) {                                         // 259
          // Delete the offending records and add the merged ones.                            // 260
          diffs.splice(pointer - count_delete - count_insert,                                 // 261
                       count_delete + count_insert);                                          // 262
          pointer = pointer - count_delete - count_insert;                                    // 263
          var a = this.diff_main(text_delete, text_insert, false, deadline);                  // 264
          for (var j = a.length - 1; j >= 0; j--) {                                           // 265
            diffs.splice(pointer, 0, a[j]);                                                   // 266
          }                                                                                   // 267
          pointer = pointer + a.length;                                                       // 268
        }                                                                                     // 269
        count_insert = 0;                                                                     // 270
        count_delete = 0;                                                                     // 271
        text_delete = '';                                                                     // 272
        text_insert = '';                                                                     // 273
        break;                                                                                // 274
    }                                                                                         // 275
    pointer++;                                                                                // 276
  }                                                                                           // 277
  diffs.pop();  // Remove the dummy entry at the end.                                         // 278
                                                                                              // 279
  return diffs;                                                                               // 280
};                                                                                            // 281
                                                                                              // 282
                                                                                              // 283
/**                                                                                           // 284
 * Find the 'middle snake' of a diff, split the problem in two                                // 285
 * and return the recursively constructed diff.                                               // 286
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.                    // 287
 * @param {string} text1 Old string to be diffed.                                             // 288
 * @param {string} text2 New string to be diffed.                                             // 289
 * @param {number} deadline Time at which to bail if not yet complete.                        // 290
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 291
 * @private                                                                                   // 292
 */                                                                                           // 293
diff_match_patch.prototype.diff_bisect_ = function(text1, text2, deadline) {                  // 294
  // Cache the text lengths to prevent multiple calls.                                        // 295
  var text1_length = text1.length;                                                            // 296
  var text2_length = text2.length;                                                            // 297
  var max_d = Math.ceil((text1_length + text2_length) / 2);                                   // 298
  var v_offset = max_d;                                                                       // 299
  var v_length = 2 * max_d;                                                                   // 300
  var v1 = new Array(v_length);                                                               // 301
  var v2 = new Array(v_length);                                                               // 302
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing                     // 303
  // integers and undefined.                                                                  // 304
  for (var x = 0; x < v_length; x++) {                                                        // 305
    v1[x] = -1;                                                                               // 306
    v2[x] = -1;                                                                               // 307
  }                                                                                           // 308
  v1[v_offset + 1] = 0;                                                                       // 309
  v2[v_offset + 1] = 0;                                                                       // 310
  var delta = text1_length - text2_length;                                                    // 311
  // If the total number of characters is odd, then the front path will collide               // 312
  // with the reverse path.                                                                   // 313
  var front = (delta % 2 != 0);                                                               // 314
  // Offsets for start and end of k loop.                                                     // 315
  // Prevents mapping of space beyond the grid.                                               // 316
  var k1start = 0;                                                                            // 317
  var k1end = 0;                                                                              // 318
  var k2start = 0;                                                                            // 319
  var k2end = 0;                                                                              // 320
  for (var d = 0; d < max_d; d++) {                                                           // 321
    // Bail out if deadline is reached.                                                       // 322
    if ((new Date()).getTime() > deadline) {                                                  // 323
      break;                                                                                  // 324
    }                                                                                         // 325
                                                                                              // 326
    // Walk the front path one step.                                                          // 327
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {                                   // 328
      var k1_offset = v_offset + k1;                                                          // 329
      var x1;                                                                                 // 330
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {                   // 331
        x1 = v1[k1_offset + 1];                                                               // 332
      } else {                                                                                // 333
        x1 = v1[k1_offset - 1] + 1;                                                           // 334
      }                                                                                       // 335
      var y1 = x1 - k1;                                                                       // 336
      while (x1 < text1_length && y1 < text2_length &&                                        // 337
             text1.charAt(x1) == text2.charAt(y1)) {                                          // 338
        x1++;                                                                                 // 339
        y1++;                                                                                 // 340
      }                                                                                       // 341
      v1[k1_offset] = x1;                                                                     // 342
      if (x1 > text1_length) {                                                                // 343
        // Ran off the right of the graph.                                                    // 344
        k1end += 2;                                                                           // 345
      } else if (y1 > text2_length) {                                                         // 346
        // Ran off the bottom of the graph.                                                   // 347
        k1start += 2;                                                                         // 348
      } else if (front) {                                                                     // 349
        var k2_offset = v_offset + delta - k1;                                                // 350
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {                  // 351
          // Mirror x2 onto top-left coordinate system.                                       // 352
          var x2 = text1_length - v2[k2_offset];                                              // 353
          if (x1 >= x2) {                                                                     // 354
            // Overlap detected.                                                              // 355
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);                    // 356
          }                                                                                   // 357
        }                                                                                     // 358
      }                                                                                       // 359
    }                                                                                         // 360
                                                                                              // 361
    // Walk the reverse path one step.                                                        // 362
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {                                   // 363
      var k2_offset = v_offset + k2;                                                          // 364
      var x2;                                                                                 // 365
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {                   // 366
        x2 = v2[k2_offset + 1];                                                               // 367
      } else {                                                                                // 368
        x2 = v2[k2_offset - 1] + 1;                                                           // 369
      }                                                                                       // 370
      var y2 = x2 - k2;                                                                       // 371
      while (x2 < text1_length && y2 < text2_length &&                                        // 372
             text1.charAt(text1_length - x2 - 1) ==                                           // 373
             text2.charAt(text2_length - y2 - 1)) {                                           // 374
        x2++;                                                                                 // 375
        y2++;                                                                                 // 376
      }                                                                                       // 377
      v2[k2_offset] = x2;                                                                     // 378
      if (x2 > text1_length) {                                                                // 379
        // Ran off the left of the graph.                                                     // 380
        k2end += 2;                                                                           // 381
      } else if (y2 > text2_length) {                                                         // 382
        // Ran off the top of the graph.                                                      // 383
        k2start += 2;                                                                         // 384
      } else if (!front) {                                                                    // 385
        var k1_offset = v_offset + delta - k2;                                                // 386
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {                  // 387
          var x1 = v1[k1_offset];                                                             // 388
          var y1 = v_offset + x1 - k1_offset;                                                 // 389
          // Mirror x2 onto top-left coordinate system.                                       // 390
          x2 = text1_length - x2;                                                             // 391
          if (x1 >= x2) {                                                                     // 392
            // Overlap detected.                                                              // 393
            return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);                    // 394
          }                                                                                   // 395
        }                                                                                     // 396
      }                                                                                       // 397
    }                                                                                         // 398
  }                                                                                           // 399
  // Diff took too long and hit the deadline or                                               // 400
  // number of diffs equals number of characters, no commonality at all.                      // 401
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];                                        // 402
};                                                                                            // 403
                                                                                              // 404
                                                                                              // 405
/**                                                                                           // 406
 * Given the location of the 'middle snake', split the diff in two parts                      // 407
 * and recurse.                                                                               // 408
 * @param {string} text1 Old string to be diffed.                                             // 409
 * @param {string} text2 New string to be diffed.                                             // 410
 * @param {number} x Index of split point in text1.                                           // 411
 * @param {number} y Index of split point in text2.                                           // 412
 * @param {number} deadline Time at which to bail if not yet complete.                        // 413
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 414
 * @private                                                                                   // 415
 */                                                                                           // 416
diff_match_patch.prototype.diff_bisectSplit_ = function(text1, text2, x, y,                   // 417
    deadline) {                                                                               // 418
  var text1a = text1.substring(0, x);                                                         // 419
  var text2a = text2.substring(0, y);                                                         // 420
  var text1b = text1.substring(x);                                                            // 421
  var text2b = text2.substring(y);                                                            // 422
                                                                                              // 423
  // Compute both diffs serially.                                                             // 424
  var diffs = this.diff_main(text1a, text2a, false, deadline);                                // 425
  var diffsb = this.diff_main(text1b, text2b, false, deadline);                               // 426
                                                                                              // 427
  return diffs.concat(diffsb);                                                                // 428
};                                                                                            // 429
                                                                                              // 430
                                                                                              // 431
/**                                                                                           // 432
 * Split two texts into an array of strings.  Reduce the texts to a string of                 // 433
 * hashes where each Unicode character represents one line.                                   // 434
 * @param {string} text1 First string.                                                        // 435
 * @param {string} text2 Second string.                                                       // 436
 * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}                     // 437
 *     An object containing the encoded text1, the encoded text2 and                          // 438
 *     the array of unique strings.                                                           // 439
 *     The zeroth element of the array of unique strings is intentionally blank.              // 440
 * @private                                                                                   // 441
 */                                                                                           // 442
diff_match_patch.prototype.diff_linesToChars_ = function(text1, text2) {                      // 443
  var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'                                      // 444
  var lineHash = {};   // e.g. lineHash['Hello\n'] == 4                                       // 445
                                                                                              // 446
  // '\x00' is a valid character, but various debuggers don't like it.                        // 447
  // So we'll insert a junk entry to avoid generating a null character.                       // 448
  lineArray[0] = '';                                                                          // 449
                                                                                              // 450
  /**                                                                                         // 451
   * Split a text into an array of strings.  Reduce the texts to a string of                  // 452
   * hashes where each Unicode character represents one line.                                 // 453
   * Modifies linearray and linehash through being a closure.                                 // 454
   * @param {string} text String to encode.                                                   // 455
   * @return {string} Encoded string.                                                         // 456
   * @private                                                                                 // 457
   */                                                                                         // 458
  function diff_linesToCharsMunge_(text) {                                                    // 459
    var chars = '';                                                                           // 460
    // Walk the text, pulling out a substring for each line.                                  // 461
    // text.split('\n') would would temporarily double our memory footprint.                  // 462
    // Modifying text would create many large strings to garbage collect.                     // 463
    var lineStart = 0;                                                                        // 464
    var lineEnd = -1;                                                                         // 465
    // Keeping our own length variable is faster than looking it up.                          // 466
    var lineArrayLength = lineArray.length;                                                   // 467
    while (lineEnd < text.length - 1) {                                                       // 468
      lineEnd = text.indexOf('\n', lineStart);                                                // 469
      if (lineEnd == -1) {                                                                    // 470
        lineEnd = text.length - 1;                                                            // 471
      }                                                                                       // 472
      var line = text.substring(lineStart, lineEnd + 1);                                      // 473
      lineStart = lineEnd + 1;                                                                // 474
                                                                                              // 475
      if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) :                           // 476
          (lineHash[line] !== undefined)) {                                                   // 477
        chars += String.fromCharCode(lineHash[line]);                                         // 478
      } else {                                                                                // 479
        chars += String.fromCharCode(lineArrayLength);                                        // 480
        lineHash[line] = lineArrayLength;                                                     // 481
        lineArray[lineArrayLength++] = line;                                                  // 482
      }                                                                                       // 483
    }                                                                                         // 484
    return chars;                                                                             // 485
  }                                                                                           // 486
                                                                                              // 487
  var chars1 = diff_linesToCharsMunge_(text1);                                                // 488
  var chars2 = diff_linesToCharsMunge_(text2);                                                // 489
  return {chars1: chars1, chars2: chars2, lineArray: lineArray};                              // 490
};                                                                                            // 491
                                                                                              // 492
                                                                                              // 493
/**                                                                                           // 494
 * Rehydrate the text in a diff from a string of line hashes to real lines of                 // 495
 * text.                                                                                      // 496
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 497
 * @param {!Array.<string>} lineArray Array of unique strings.                                // 498
 * @private                                                                                   // 499
 */                                                                                           // 500
diff_match_patch.prototype.diff_charsToLines_ = function(diffs, lineArray) {                  // 501
  for (var x = 0; x < diffs.length; x++) {                                                    // 502
    var chars = diffs[x][1];                                                                  // 503
    var text = [];                                                                            // 504
    for (var y = 0; y < chars.length; y++) {                                                  // 505
      text[y] = lineArray[chars.charCodeAt(y)];                                               // 506
    }                                                                                         // 507
    diffs[x][1] = text.join('');                                                              // 508
  }                                                                                           // 509
};                                                                                            // 510
                                                                                              // 511
                                                                                              // 512
/**                                                                                           // 513
 * Determine the common prefix of two strings.                                                // 514
 * @param {string} text1 First string.                                                        // 515
 * @param {string} text2 Second string.                                                       // 516
 * @return {number} The number of characters common to the start of each                      // 517
 *     string.                                                                                // 518
 */                                                                                           // 519
diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {                       // 520
  // Quick check for common null cases.                                                       // 521
  if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {                               // 522
    return 0;                                                                                 // 523
  }                                                                                           // 524
  // Binary search.                                                                           // 525
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/                           // 526
  var pointermin = 0;                                                                         // 527
  var pointermax = Math.min(text1.length, text2.length);                                      // 528
  var pointermid = pointermax;                                                                // 529
  var pointerstart = 0;                                                                       // 530
  while (pointermin < pointermid) {                                                           // 531
    if (text1.substring(pointerstart, pointermid) ==                                          // 532
        text2.substring(pointerstart, pointermid)) {                                          // 533
      pointermin = pointermid;                                                                // 534
      pointerstart = pointermin;                                                              // 535
    } else {                                                                                  // 536
      pointermax = pointermid;                                                                // 537
    }                                                                                         // 538
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);                      // 539
  }                                                                                           // 540
  return pointermid;                                                                          // 541
};                                                                                            // 542
                                                                                              // 543
                                                                                              // 544
/**                                                                                           // 545
 * Determine the common suffix of two strings.                                                // 546
 * @param {string} text1 First string.                                                        // 547
 * @param {string} text2 Second string.                                                       // 548
 * @return {number} The number of characters common to the end of each string.                // 549
 */                                                                                           // 550
diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {                       // 551
  // Quick check for common null cases.                                                       // 552
  if (!text1 || !text2 ||                                                                     // 553
      text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {                     // 554
    return 0;                                                                                 // 555
  }                                                                                           // 556
  // Binary search.                                                                           // 557
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/                           // 558
  var pointermin = 0;                                                                         // 559
  var pointermax = Math.min(text1.length, text2.length);                                      // 560
  var pointermid = pointermax;                                                                // 561
  var pointerend = 0;                                                                         // 562
  while (pointermin < pointermid) {                                                           // 563
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==              // 564
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {              // 565
      pointermin = pointermid;                                                                // 566
      pointerend = pointermin;                                                                // 567
    } else {                                                                                  // 568
      pointermax = pointermid;                                                                // 569
    }                                                                                         // 570
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);                      // 571
  }                                                                                           // 572
  return pointermid;                                                                          // 573
};                                                                                            // 574
                                                                                              // 575
                                                                                              // 576
/**                                                                                           // 577
 * Determine if the suffix of one string is the prefix of another.                            // 578
 * @param {string} text1 First string.                                                        // 579
 * @param {string} text2 Second string.                                                       // 580
 * @return {number} The number of characters common to the end of the first                   // 581
 *     string and the start of the second string.                                             // 582
 * @private                                                                                   // 583
 */                                                                                           // 584
diff_match_patch.prototype.diff_commonOverlap_ = function(text1, text2) {                     // 585
  // Cache the text lengths to prevent multiple calls.                                        // 586
  var text1_length = text1.length;                                                            // 587
  var text2_length = text2.length;                                                            // 588
  // Eliminate the null case.                                                                 // 589
  if (text1_length == 0 || text2_length == 0) {                                               // 590
    return 0;                                                                                 // 591
  }                                                                                           // 592
  // Truncate the longer string.                                                              // 593
  if (text1_length > text2_length) {                                                          // 594
    text1 = text1.substring(text1_length - text2_length);                                     // 595
  } else if (text1_length < text2_length) {                                                   // 596
    text2 = text2.substring(0, text1_length);                                                 // 597
  }                                                                                           // 598
  var text_length = Math.min(text1_length, text2_length);                                     // 599
  // Quick check for the worst case.                                                          // 600
  if (text1 == text2) {                                                                       // 601
    return text_length;                                                                       // 602
  }                                                                                           // 603
                                                                                              // 604
  // Start by looking for a single character match                                            // 605
  // and increase length until no match is found.                                             // 606
  // Performance analysis: http://neil.fraser.name/news/2010/11/04/                           // 607
  var best = 0;                                                                               // 608
  var length = 1;                                                                             // 609
  while (true) {                                                                              // 610
    var pattern = text1.substring(text_length - length);                                      // 611
    var found = text2.indexOf(pattern);                                                       // 612
    if (found == -1) {                                                                        // 613
      return best;                                                                            // 614
    }                                                                                         // 615
    length += found;                                                                          // 616
    if (found == 0 || text1.substring(text_length - length) ==                                // 617
        text2.substring(0, length)) {                                                         // 618
      best = length;                                                                          // 619
      length++;                                                                               // 620
    }                                                                                         // 621
  }                                                                                           // 622
};                                                                                            // 623
                                                                                              // 624
                                                                                              // 625
/**                                                                                           // 626
 * Do the two texts share a substring which is at least half the length of the                // 627
 * longer text?                                                                               // 628
 * This speedup can produce non-minimal diffs.                                                // 629
 * @param {string} text1 First string.                                                        // 630
 * @param {string} text2 Second string.                                                       // 631
 * @return {Array.<string>} Five element Array, containing the prefix of                      // 632
 *     text1, the suffix of text1, the prefix of text2, the suffix of                         // 633
 *     text2 and the common middle.  Or null if there was no match.                           // 634
 * @private                                                                                   // 635
 */                                                                                           // 636
diff_match_patch.prototype.diff_halfMatch_ = function(text1, text2) {                         // 637
  if (this.Diff_Timeout <= 0) {                                                               // 638
    // Don't risk returning a non-optimal diff if we have unlimited time.                     // 639
    return null;                                                                              // 640
  }                                                                                           // 641
  var longtext = text1.length > text2.length ? text1 : text2;                                 // 642
  var shorttext = text1.length > text2.length ? text2 : text1;                                // 643
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {                        // 644
    return null;  // Pointless.                                                               // 645
  }                                                                                           // 646
  var dmp = this;  // 'this' becomes 'window' in a closure.                                   // 647
                                                                                              // 648
  /**                                                                                         // 649
   * Does a substring of shorttext exist within longtext such that the substring              // 650
   * is at least half the length of longtext?                                                 // 651
   * Closure, but does not reference any external variables.                                  // 652
   * @param {string} longtext Longer string.                                                  // 653
   * @param {string} shorttext Shorter string.                                                // 654
   * @param {number} i Start index of quarter length substring within longtext.               // 655
   * @return {Array.<string>} Five element Array, containing the prefix of                    // 656
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix                // 657
   *     of shorttext and the common middle.  Or null if there was no match.                  // 658
   * @private                                                                                 // 659
   */                                                                                         // 660
  function diff_halfMatchI_(longtext, shorttext, i) {                                         // 661
    // Start with a 1/4 length substring at position i as a seed.                             // 662
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));                    // 663
    var j = -1;                                                                               // 664
    var best_common = '';                                                                     // 665
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;                 // 666
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {                                      // 667
      var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),                         // 668
                                               shorttext.substring(j));                       // 669
      var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),                      // 670
                                               shorttext.substring(0, j));                    // 671
      if (best_common.length < suffixLength + prefixLength) {                                 // 672
        best_common = shorttext.substring(j - suffixLength, j) +                              // 673
            shorttext.substring(j, j + prefixLength);                                         // 674
        best_longtext_a = longtext.substring(0, i - suffixLength);                            // 675
        best_longtext_b = longtext.substring(i + prefixLength);                               // 676
        best_shorttext_a = shorttext.substring(0, j - suffixLength);                          // 677
        best_shorttext_b = shorttext.substring(j + prefixLength);                             // 678
      }                                                                                       // 679
    }                                                                                         // 680
    if (best_common.length * 2 >= longtext.length) {                                          // 681
      return [best_longtext_a, best_longtext_b,                                               // 682
              best_shorttext_a, best_shorttext_b, best_common];                               // 683
    } else {                                                                                  // 684
      return null;                                                                            // 685
    }                                                                                         // 686
  }                                                                                           // 687
                                                                                              // 688
  // First check if the second quarter is the seed for a half-match.                          // 689
  var hm1 = diff_halfMatchI_(longtext, shorttext,                                             // 690
                             Math.ceil(longtext.length / 4));                                 // 691
  // Check again based on the third quarter.                                                  // 692
  var hm2 = diff_halfMatchI_(longtext, shorttext,                                             // 693
                             Math.ceil(longtext.length / 2));                                 // 694
  var hm;                                                                                     // 695
  if (!hm1 && !hm2) {                                                                         // 696
    return null;                                                                              // 697
  } else if (!hm2) {                                                                          // 698
    hm = hm1;                                                                                 // 699
  } else if (!hm1) {                                                                          // 700
    hm = hm2;                                                                                 // 701
  } else {                                                                                    // 702
    // Both matched.  Select the longest.                                                     // 703
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;                                           // 704
  }                                                                                           // 705
                                                                                              // 706
  // A half-match was found, sort out the return data.                                        // 707
  var text1_a, text1_b, text2_a, text2_b;                                                     // 708
  if (text1.length > text2.length) {                                                          // 709
    text1_a = hm[0];                                                                          // 710
    text1_b = hm[1];                                                                          // 711
    text2_a = hm[2];                                                                          // 712
    text2_b = hm[3];                                                                          // 713
  } else {                                                                                    // 714
    text2_a = hm[0];                                                                          // 715
    text2_b = hm[1];                                                                          // 716
    text1_a = hm[2];                                                                          // 717
    text1_b = hm[3];                                                                          // 718
  }                                                                                           // 719
  var mid_common = hm[4];                                                                     // 720
  return [text1_a, text1_b, text2_a, text2_b, mid_common];                                    // 721
};                                                                                            // 722
                                                                                              // 723
                                                                                              // 724
/**                                                                                           // 725
 * Reduce the number of edits by eliminating semantically trivial equalities.                 // 726
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 727
 */                                                                                           // 728
diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {                           // 729
  var changes = false;                                                                        // 730
  var equalities = [];  // Stack of indices where equalities are found.                       // 731
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.                   // 732
  /** @type {?string} */                                                                      // 733
  var lastequality = null;                                                                    // 734
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]                               // 735
  var pointer = 0;  // Index of current position.                                             // 736
  // Number of characters that changed prior to the equality.                                 // 737
  var length_insertions1 = 0;                                                                 // 738
  var length_deletions1 = 0;                                                                  // 739
  // Number of characters that changed after the equality.                                    // 740
  var length_insertions2 = 0;                                                                 // 741
  var length_deletions2 = 0;                                                                  // 742
  while (pointer < diffs.length) {                                                            // 743
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.                                // 744
      equalities[equalitiesLength++] = pointer;                                               // 745
      length_insertions1 = length_insertions2;                                                // 746
      length_deletions1 = length_deletions2;                                                  // 747
      length_insertions2 = 0;                                                                 // 748
      length_deletions2 = 0;                                                                  // 749
      lastequality = diffs[pointer][1];                                                       // 750
    } else {  // An insertion or deletion.                                                    // 751
      if (diffs[pointer][0] == DIFF_INSERT) {                                                 // 752
        length_insertions2 += diffs[pointer][1].length;                                       // 753
      } else {                                                                                // 754
        length_deletions2 += diffs[pointer][1].length;                                        // 755
      }                                                                                       // 756
      // Eliminate an equality that is smaller or equal to the edits on both                  // 757
      // sides of it.                                                                         // 758
      if (lastequality && (lastequality.length <=                                             // 759
          Math.max(length_insertions1, length_deletions1)) &&                                 // 760
          (lastequality.length <= Math.max(length_insertions2,                                // 761
                                           length_deletions2))) {                             // 762
        // Duplicate record.                                                                  // 763
        diffs.splice(equalities[equalitiesLength - 1], 0,                                     // 764
                     [DIFF_DELETE, lastequality]);                                            // 765
        // Change second copy to insert.                                                      // 766
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;                         // 767
        // Throw away the equality we just deleted.                                           // 768
        equalitiesLength--;                                                                   // 769
        // Throw away the previous equality (it needs to be reevaluated).                     // 770
        equalitiesLength--;                                                                   // 771
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;               // 772
        length_insertions1 = 0;  // Reset the counters.                                       // 773
        length_deletions1 = 0;                                                                // 774
        length_insertions2 = 0;                                                               // 775
        length_deletions2 = 0;                                                                // 776
        lastequality = null;                                                                  // 777
        changes = true;                                                                       // 778
      }                                                                                       // 779
    }                                                                                         // 780
    pointer++;                                                                                // 781
  }                                                                                           // 782
                                                                                              // 783
  // Normalize the diff.                                                                      // 784
  if (changes) {                                                                              // 785
    this.diff_cleanupMerge(diffs);                                                            // 786
  }                                                                                           // 787
  this.diff_cleanupSemanticLossless(diffs);                                                   // 788
                                                                                              // 789
  // Find any overlaps between deletions and insertions.                                      // 790
  // e.g: <del>abcxxx</del><ins>xxxdef</ins>                                                  // 791
  //   -> <del>abc</del>xxx<ins>def</ins>                                                     // 792
  // e.g: <del>xxxabc</del><ins>defxxx</ins>                                                  // 793
  //   -> <ins>def</ins>xxx<del>abc</del>                                                     // 794
  // Only extract an overlap if it is as big as the edit ahead or behind it.                  // 795
  pointer = 1;                                                                                // 796
  while (pointer < diffs.length) {                                                            // 797
    if (diffs[pointer - 1][0] == DIFF_DELETE &&                                               // 798
        diffs[pointer][0] == DIFF_INSERT) {                                                   // 799
      var deletion = diffs[pointer - 1][1];                                                   // 800
      var insertion = diffs[pointer][1];                                                      // 801
      var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);                    // 802
      var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);                    // 803
      if (overlap_length1 >= overlap_length2) {                                               // 804
        if (overlap_length1 >= deletion.length / 2 ||                                         // 805
            overlap_length1 >= insertion.length / 2) {                                        // 806
          // Overlap found.  Insert an equality and trim the surrounding edits.               // 807
          diffs.splice(pointer, 0,                                                            // 808
              [DIFF_EQUAL, insertion.substring(0, overlap_length1)]);                         // 809
          diffs[pointer - 1][1] =                                                             // 810
              deletion.substring(0, deletion.length - overlap_length1);                       // 811
          diffs[pointer + 1][1] = insertion.substring(overlap_length1);                       // 812
          pointer++;                                                                          // 813
        }                                                                                     // 814
      } else {                                                                                // 815
        if (overlap_length2 >= deletion.length / 2 ||                                         // 816
            overlap_length2 >= insertion.length / 2) {                                        // 817
          // Reverse overlap found.                                                           // 818
          // Insert an equality and swap and trim the surrounding edits.                      // 819
          diffs.splice(pointer, 0,                                                            // 820
              [DIFF_EQUAL, deletion.substring(0, overlap_length2)]);                          // 821
          diffs[pointer - 1][0] = DIFF_INSERT;                                                // 822
          diffs[pointer - 1][1] =                                                             // 823
              insertion.substring(0, insertion.length - overlap_length2);                     // 824
          diffs[pointer + 1][0] = DIFF_DELETE;                                                // 825
          diffs[pointer + 1][1] =                                                             // 826
              deletion.substring(overlap_length2);                                            // 827
          pointer++;                                                                          // 828
        }                                                                                     // 829
      }                                                                                       // 830
      pointer++;                                                                              // 831
    }                                                                                         // 832
    pointer++;                                                                                // 833
  }                                                                                           // 834
};                                                                                            // 835
                                                                                              // 836
                                                                                              // 837
/**                                                                                           // 838
 * Look for single edits surrounded on both sides by equalities                               // 839
 * which can be shifted sideways to align the edit to a word boundary.                        // 840
 * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.                                  // 841
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 842
 */                                                                                           // 843
diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {                   // 844
  /**                                                                                         // 845
   * Given two strings, compute a score representing whether the internal                     // 846
   * boundary falls on logical boundaries.                                                    // 847
   * Scores range from 6 (best) to 0 (worst).                                                 // 848
   * Closure, but does not reference any external variables.                                  // 849
   * @param {string} one First string.                                                        // 850
   * @param {string} two Second string.                                                       // 851
   * @return {number} The score.                                                              // 852
   * @private                                                                                 // 853
   */                                                                                         // 854
  function diff_cleanupSemanticScore_(one, two) {                                             // 855
    if (!one || !two) {                                                                       // 856
      // Edges are the best.                                                                  // 857
      return 6;                                                                               // 858
    }                                                                                         // 859
                                                                                              // 860
    // Each port of this function behaves slightly differently due to                         // 861
    // subtle differences in each language's definition of things like                        // 862
    // 'whitespace'.  Since this function's purpose is largely cosmetic,                      // 863
    // the choice has been made to use each language's native features                        // 864
    // rather than force total conformity.                                                    // 865
    var char1 = one.charAt(one.length - 1);                                                   // 866
    var char2 = two.charAt(0);                                                                // 867
    var nonAlphaNumeric1 = char1.match(diff_match_patch.nonAlphaNumericRegex_);               // 868
    var nonAlphaNumeric2 = char2.match(diff_match_patch.nonAlphaNumericRegex_);               // 869
    var whitespace1 = nonAlphaNumeric1 &&                                                     // 870
        char1.match(diff_match_patch.whitespaceRegex_);                                       // 871
    var whitespace2 = nonAlphaNumeric2 &&                                                     // 872
        char2.match(diff_match_patch.whitespaceRegex_);                                       // 873
    var lineBreak1 = whitespace1 &&                                                           // 874
        char1.match(diff_match_patch.linebreakRegex_);                                        // 875
    var lineBreak2 = whitespace2 &&                                                           // 876
        char2.match(diff_match_patch.linebreakRegex_);                                        // 877
    var blankLine1 = lineBreak1 &&                                                            // 878
        one.match(diff_match_patch.blanklineEndRegex_);                                       // 879
    var blankLine2 = lineBreak2 &&                                                            // 880
        two.match(diff_match_patch.blanklineStartRegex_);                                     // 881
                                                                                              // 882
    if (blankLine1 || blankLine2) {                                                           // 883
      // Five points for blank lines.                                                         // 884
      return 5;                                                                               // 885
    } else if (lineBreak1 || lineBreak2) {                                                    // 886
      // Four points for line breaks.                                                         // 887
      return 4;                                                                               // 888
    } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {                             // 889
      // Three points for end of sentences.                                                   // 890
      return 3;                                                                               // 891
    } else if (whitespace1 || whitespace2) {                                                  // 892
      // Two points for whitespace.                                                           // 893
      return 2;                                                                               // 894
    } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {                                        // 895
      // One point for non-alphanumeric.                                                      // 896
      return 1;                                                                               // 897
    }                                                                                         // 898
    return 0;                                                                                 // 899
  }                                                                                           // 900
                                                                                              // 901
  var pointer = 1;                                                                            // 902
  // Intentionally ignore the first and last element (don't need checking).                   // 903
  while (pointer < diffs.length - 1) {                                                        // 904
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&                                                // 905
        diffs[pointer + 1][0] == DIFF_EQUAL) {                                                // 906
      // This is a single edit surrounded by equalities.                                      // 907
      var equality1 = diffs[pointer - 1][1];                                                  // 908
      var edit = diffs[pointer][1];                                                           // 909
      var equality2 = diffs[pointer + 1][1];                                                  // 910
                                                                                              // 911
      // First, shift the edit as far left as possible.                                       // 912
      var commonOffset = this.diff_commonSuffix(equality1, edit);                             // 913
      if (commonOffset) {                                                                     // 914
        var commonString = edit.substring(edit.length - commonOffset);                        // 915
        equality1 = equality1.substring(0, equality1.length - commonOffset);                  // 916
        edit = commonString + edit.substring(0, edit.length - commonOffset);                  // 917
        equality2 = commonString + equality2;                                                 // 918
      }                                                                                       // 919
                                                                                              // 920
      // Second, step character by character right, looking for the best fit.                 // 921
      var bestEquality1 = equality1;                                                          // 922
      var bestEdit = edit;                                                                    // 923
      var bestEquality2 = equality2;                                                          // 924
      var bestScore = diff_cleanupSemanticScore_(equality1, edit) +                           // 925
          diff_cleanupSemanticScore_(edit, equality2);                                        // 926
      while (edit.charAt(0) === equality2.charAt(0)) {                                        // 927
        equality1 += edit.charAt(0);                                                          // 928
        edit = edit.substring(1) + equality2.charAt(0);                                       // 929
        equality2 = equality2.substring(1);                                                   // 930
        var score = diff_cleanupSemanticScore_(equality1, edit) +                             // 931
            diff_cleanupSemanticScore_(edit, equality2);                                      // 932
        // The >= encourages trailing rather than leading whitespace on edits.                // 933
        if (score >= bestScore) {                                                             // 934
          bestScore = score;                                                                  // 935
          bestEquality1 = equality1;                                                          // 936
          bestEdit = edit;                                                                    // 937
          bestEquality2 = equality2;                                                          // 938
        }                                                                                     // 939
      }                                                                                       // 940
                                                                                              // 941
      if (diffs[pointer - 1][1] != bestEquality1) {                                           // 942
        // We have an improvement, save it back to the diff.                                  // 943
        if (bestEquality1) {                                                                  // 944
          diffs[pointer - 1][1] = bestEquality1;                                              // 945
        } else {                                                                              // 946
          diffs.splice(pointer - 1, 1);                                                       // 947
          pointer--;                                                                          // 948
        }                                                                                     // 949
        diffs[pointer][1] = bestEdit;                                                         // 950
        if (bestEquality2) {                                                                  // 951
          diffs[pointer + 1][1] = bestEquality2;                                              // 952
        } else {                                                                              // 953
          diffs.splice(pointer + 1, 1);                                                       // 954
          pointer--;                                                                          // 955
        }                                                                                     // 956
      }                                                                                       // 957
    }                                                                                         // 958
    pointer++;                                                                                // 959
  }                                                                                           // 960
};                                                                                            // 961
                                                                                              // 962
// Define some regex patterns for matching boundaries.                                        // 963
diff_match_patch.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;                                      // 964
diff_match_patch.whitespaceRegex_ = /\s/;                                                     // 965
diff_match_patch.linebreakRegex_ = /[\r\n]/;                                                  // 966
diff_match_patch.blanklineEndRegex_ = /\n\r?\n$/;                                             // 967
diff_match_patch.blanklineStartRegex_ = /^\r?\n\r?\n/;                                        // 968
                                                                                              // 969
/**                                                                                           // 970
 * Reduce the number of edits by eliminating operationally trivial equalities.                // 971
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 972
 */                                                                                           // 973
diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {                         // 974
  var changes = false;                                                                        // 975
  var equalities = [];  // Stack of indices where equalities are found.                       // 976
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.                   // 977
  /** @type {?string} */                                                                      // 978
  var lastequality = null;                                                                    // 979
  // Always equal to diffs[equalities[equalitiesLength - 1]][1]                               // 980
  var pointer = 0;  // Index of current position.                                             // 981
  // Is there an insertion operation before the last equality.                                // 982
  var pre_ins = false;                                                                        // 983
  // Is there a deletion operation before the last equality.                                  // 984
  var pre_del = false;                                                                        // 985
  // Is there an insertion operation after the last equality.                                 // 986
  var post_ins = false;                                                                       // 987
  // Is there a deletion operation after the last equality.                                   // 988
  var post_del = false;                                                                       // 989
  while (pointer < diffs.length) {                                                            // 990
    if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.                                // 991
      if (diffs[pointer][1].length < this.Diff_EditCost &&                                    // 992
          (post_ins || post_del)) {                                                           // 993
        // Candidate found.                                                                   // 994
        equalities[equalitiesLength++] = pointer;                                             // 995
        pre_ins = post_ins;                                                                   // 996
        pre_del = post_del;                                                                   // 997
        lastequality = diffs[pointer][1];                                                     // 998
      } else {                                                                                // 999
        // Not a candidate, and can never become one.                                         // 1000
        equalitiesLength = 0;                                                                 // 1001
        lastequality = null;                                                                  // 1002
      }                                                                                       // 1003
      post_ins = post_del = false;                                                            // 1004
    } else {  // An insertion or deletion.                                                    // 1005
      if (diffs[pointer][0] == DIFF_DELETE) {                                                 // 1006
        post_del = true;                                                                      // 1007
      } else {                                                                                // 1008
        post_ins = true;                                                                      // 1009
      }                                                                                       // 1010
      /*                                                                                      // 1011
       * Five types to be split:                                                              // 1012
       * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>                                   // 1013
       * <ins>A</ins>X<ins>C</ins><del>D</del>                                                // 1014
       * <ins>A</ins><del>B</del>X<ins>C</ins>                                                // 1015
       * <ins>A</del>X<ins>C</ins><del>D</del>                                                // 1016
       * <ins>A</ins><del>B</del>X<del>C</del>                                                // 1017
       */                                                                                     // 1018
      if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||                    // 1019
                           ((lastequality.length < this.Diff_EditCost / 2) &&                 // 1020
                            (pre_ins + pre_del + post_ins + post_del) == 3))) {               // 1021
        // Duplicate record.                                                                  // 1022
        diffs.splice(equalities[equalitiesLength - 1], 0,                                     // 1023
                     [DIFF_DELETE, lastequality]);                                            // 1024
        // Change second copy to insert.                                                      // 1025
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;                         // 1026
        equalitiesLength--;  // Throw away the equality we just deleted;                      // 1027
        lastequality = null;                                                                  // 1028
        if (pre_ins && pre_del) {                                                             // 1029
          // No changes made which could affect previous entry, keep going.                   // 1030
          post_ins = post_del = true;                                                         // 1031
          equalitiesLength = 0;                                                               // 1032
        } else {                                                                              // 1033
          equalitiesLength--;  // Throw away the previous equality.                           // 1034
          pointer = equalitiesLength > 0 ?                                                    // 1035
              equalities[equalitiesLength - 1] : -1;                                          // 1036
          post_ins = post_del = false;                                                        // 1037
        }                                                                                     // 1038
        changes = true;                                                                       // 1039
      }                                                                                       // 1040
    }                                                                                         // 1041
    pointer++;                                                                                // 1042
  }                                                                                           // 1043
                                                                                              // 1044
  if (changes) {                                                                              // 1045
    this.diff_cleanupMerge(diffs);                                                            // 1046
  }                                                                                           // 1047
};                                                                                            // 1048
                                                                                              // 1049
                                                                                              // 1050
/**                                                                                           // 1051
 * Reorder and merge like edit sections.  Merge equalities.                                   // 1052
 * Any edit section can move as long as it doesn't cross an equality.                         // 1053
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1054
 */                                                                                           // 1055
diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {                              // 1056
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.                             // 1057
  var pointer = 0;                                                                            // 1058
  var count_delete = 0;                                                                       // 1059
  var count_insert = 0;                                                                       // 1060
  var text_delete = '';                                                                       // 1061
  var text_insert = '';                                                                       // 1062
  var commonlength;                                                                           // 1063
  while (pointer < diffs.length) {                                                            // 1064
    switch (diffs[pointer][0]) {                                                              // 1065
      case DIFF_INSERT:                                                                       // 1066
        count_insert++;                                                                       // 1067
        text_insert += diffs[pointer][1];                                                     // 1068
        pointer++;                                                                            // 1069
        break;                                                                                // 1070
      case DIFF_DELETE:                                                                       // 1071
        count_delete++;                                                                       // 1072
        text_delete += diffs[pointer][1];                                                     // 1073
        pointer++;                                                                            // 1074
        break;                                                                                // 1075
      case DIFF_EQUAL:                                                                        // 1076
        // Upon reaching an equality, check for prior redundancies.                           // 1077
        if (count_delete + count_insert > 1) {                                                // 1078
          if (count_delete !== 0 && count_insert !== 0) {                                     // 1079
            // Factor out any common prefixies.                                               // 1080
            commonlength = this.diff_commonPrefix(text_insert, text_delete);                  // 1081
            if (commonlength !== 0) {                                                         // 1082
              if ((pointer - count_delete - count_insert) > 0 &&                              // 1083
                  diffs[pointer - count_delete - count_insert - 1][0] ==                      // 1084
                  DIFF_EQUAL) {                                                               // 1085
                diffs[pointer - count_delete - count_insert - 1][1] +=                        // 1086
                    text_insert.substring(0, commonlength);                                   // 1087
              } else {                                                                        // 1088
                diffs.splice(0, 0, [DIFF_EQUAL,                                               // 1089
                                    text_insert.substring(0, commonlength)]);                 // 1090
                pointer++;                                                                    // 1091
              }                                                                               // 1092
              text_insert = text_insert.substring(commonlength);                              // 1093
              text_delete = text_delete.substring(commonlength);                              // 1094
            }                                                                                 // 1095
            // Factor out any common suffixies.                                               // 1096
            commonlength = this.diff_commonSuffix(text_insert, text_delete);                  // 1097
            if (commonlength !== 0) {                                                         // 1098
              diffs[pointer][1] = text_insert.substring(text_insert.length -                  // 1099
                  commonlength) + diffs[pointer][1];                                          // 1100
              text_insert = text_insert.substring(0, text_insert.length -                     // 1101
                  commonlength);                                                              // 1102
              text_delete = text_delete.substring(0, text_delete.length -                     // 1103
                  commonlength);                                                              // 1104
            }                                                                                 // 1105
          }                                                                                   // 1106
          // Delete the offending records and add the merged ones.                            // 1107
          if (count_delete === 0) {                                                           // 1108
            diffs.splice(pointer - count_insert,                                              // 1109
                count_delete + count_insert, [DIFF_INSERT, text_insert]);                     // 1110
          } else if (count_insert === 0) {                                                    // 1111
            diffs.splice(pointer - count_delete,                                              // 1112
                count_delete + count_insert, [DIFF_DELETE, text_delete]);                     // 1113
          } else {                                                                            // 1114
            diffs.splice(pointer - count_delete - count_insert,                               // 1115
                count_delete + count_insert, [DIFF_DELETE, text_delete],                      // 1116
                [DIFF_INSERT, text_insert]);                                                  // 1117
          }                                                                                   // 1118
          pointer = pointer - count_delete - count_insert +                                   // 1119
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;                      // 1120
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {                    // 1121
          // Merge this equality with the previous one.                                       // 1122
          diffs[pointer - 1][1] += diffs[pointer][1];                                         // 1123
          diffs.splice(pointer, 1);                                                           // 1124
        } else {                                                                              // 1125
          pointer++;                                                                          // 1126
        }                                                                                     // 1127
        count_insert = 0;                                                                     // 1128
        count_delete = 0;                                                                     // 1129
        text_delete = '';                                                                     // 1130
        text_insert = '';                                                                     // 1131
        break;                                                                                // 1132
    }                                                                                         // 1133
  }                                                                                           // 1134
  if (diffs[diffs.length - 1][1] === '') {                                                    // 1135
    diffs.pop();  // Remove the dummy entry at the end.                                       // 1136
  }                                                                                           // 1137
                                                                                              // 1138
  // Second pass: look for single edits surrounded on both sides by equalities                // 1139
  // which can be shifted sideways to eliminate an equality.                                  // 1140
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC                                                  // 1141
  var changes = false;                                                                        // 1142
  pointer = 1;                                                                                // 1143
  // Intentionally ignore the first and last element (don't need checking).                   // 1144
  while (pointer < diffs.length - 1) {                                                        // 1145
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&                                                // 1146
        diffs[pointer + 1][0] == DIFF_EQUAL) {                                                // 1147
      // This is a single edit surrounded by equalities.                                      // 1148
      if (diffs[pointer][1].substring(diffs[pointer][1].length -                              // 1149
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {                           // 1150
        // Shift the edit over the previous equality.                                         // 1151
        diffs[pointer][1] = diffs[pointer - 1][1] +                                           // 1152
            diffs[pointer][1].substring(0, diffs[pointer][1].length -                         // 1153
                                        diffs[pointer - 1][1].length);                        // 1154
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];                // 1155
        diffs.splice(pointer - 1, 1);                                                         // 1156
        changes = true;                                                                       // 1157
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==              // 1158
          diffs[pointer + 1][1]) {                                                            // 1159
        // Shift the edit over the next equality.                                             // 1160
        diffs[pointer - 1][1] += diffs[pointer + 1][1];                                       // 1161
        diffs[pointer][1] =                                                                   // 1162
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +                       // 1163
            diffs[pointer + 1][1];                                                            // 1164
        diffs.splice(pointer + 1, 1);                                                         // 1165
        changes = true;                                                                       // 1166
      }                                                                                       // 1167
    }                                                                                         // 1168
    pointer++;                                                                                // 1169
  }                                                                                           // 1170
  // If shifts were made, the diff needs reordering and another shift sweep.                  // 1171
  if (changes) {                                                                              // 1172
    this.diff_cleanupMerge(diffs);                                                            // 1173
  }                                                                                           // 1174
};                                                                                            // 1175
                                                                                              // 1176
                                                                                              // 1177
/**                                                                                           // 1178
 * loc is a location in text1, compute and return the equivalent location in                  // 1179
 * text2.                                                                                     // 1180
 * e.g. 'The cat' vs 'The big cat', 1->1, 5->8                                                // 1181
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1182
 * @param {number} loc Location within text1.                                                 // 1183
 * @return {number} Location within text2.                                                    // 1184
 */                                                                                           // 1185
diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {                               // 1186
  var chars1 = 0;                                                                             // 1187
  var chars2 = 0;                                                                             // 1188
  var last_chars1 = 0;                                                                        // 1189
  var last_chars2 = 0;                                                                        // 1190
  var x;                                                                                      // 1191
  for (x = 0; x < diffs.length; x++) {                                                        // 1192
    if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.                              // 1193
      chars1 += diffs[x][1].length;                                                           // 1194
    }                                                                                         // 1195
    if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.                             // 1196
      chars2 += diffs[x][1].length;                                                           // 1197
    }                                                                                         // 1198
    if (chars1 > loc) {  // Overshot the location.                                            // 1199
      break;                                                                                  // 1200
    }                                                                                         // 1201
    last_chars1 = chars1;                                                                     // 1202
    last_chars2 = chars2;                                                                     // 1203
  }                                                                                           // 1204
  // Was the location was deleted?                                                            // 1205
  if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {                                     // 1206
    return last_chars2;                                                                       // 1207
  }                                                                                           // 1208
  // Add the remaining character length.                                                      // 1209
  return last_chars2 + (loc - last_chars1);                                                   // 1210
};                                                                                            // 1211
                                                                                              // 1212
                                                                                              // 1213
/**                                                                                           // 1214
 * Convert a diff array into a pretty HTML report.                                            // 1215
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1216
 * @return {string} HTML representation.                                                      // 1217
 */                                                                                           // 1218
diff_match_patch.prototype.diff_prettyHtml = function(diffs) {                                // 1219
  var html = [];                                                                              // 1220
  var pattern_amp = /&/g;                                                                     // 1221
  var pattern_lt = /</g;                                                                      // 1222
  var pattern_gt = />/g;                                                                      // 1223
  var pattern_para = /\n/g;                                                                   // 1224
  for (var x = 0; x < diffs.length; x++) {                                                    // 1225
    var op = diffs[x][0];    // Operation (insert, delete, equal)                             // 1226
    var data = diffs[x][1];  // Text of change.                                               // 1227
    var text = data.replace(pattern_amp, '&amp;').replace(pattern_lt, '&lt;')                 // 1228
        .replace(pattern_gt, '&gt;').replace(pattern_para, '&para;<br>');                     // 1229
    switch (op) {                                                                             // 1230
      case DIFF_INSERT:                                                                       // 1231
        html[x] = '<ins style="background:#e6ffe6;">' + text + '</ins>';                      // 1232
        break;                                                                                // 1233
      case DIFF_DELETE:                                                                       // 1234
        html[x] = '<del style="background:#ffe6e6;">' + text + '</del>';                      // 1235
        break;                                                                                // 1236
      case DIFF_EQUAL:                                                                        // 1237
        html[x] = '<span>' + text + '</span>';                                                // 1238
        break;                                                                                // 1239
    }                                                                                         // 1240
  }                                                                                           // 1241
  return html.join('');                                                                       // 1242
};                                                                                            // 1243
                                                                                              // 1244
                                                                                              // 1245
/**                                                                                           // 1246
 * Compute and return the source text (all equalities and deletions).                         // 1247
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1248
 * @return {string} Source text.                                                              // 1249
 */                                                                                           // 1250
diff_match_patch.prototype.diff_text1 = function(diffs) {                                     // 1251
  var text = [];                                                                              // 1252
  for (var x = 0; x < diffs.length; x++) {                                                    // 1253
    if (diffs[x][0] !== DIFF_INSERT) {                                                        // 1254
      text[x] = diffs[x][1];                                                                  // 1255
    }                                                                                         // 1256
  }                                                                                           // 1257
  return text.join('');                                                                       // 1258
};                                                                                            // 1259
                                                                                              // 1260
                                                                                              // 1261
/**                                                                                           // 1262
 * Compute and return the destination text (all equalities and insertions).                   // 1263
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1264
 * @return {string} Destination text.                                                         // 1265
 */                                                                                           // 1266
diff_match_patch.prototype.diff_text2 = function(diffs) {                                     // 1267
  var text = [];                                                                              // 1268
  for (var x = 0; x < diffs.length; x++) {                                                    // 1269
    if (diffs[x][0] !== DIFF_DELETE) {                                                        // 1270
      text[x] = diffs[x][1];                                                                  // 1271
    }                                                                                         // 1272
  }                                                                                           // 1273
  return text.join('');                                                                       // 1274
};                                                                                            // 1275
                                                                                              // 1276
                                                                                              // 1277
/**                                                                                           // 1278
 * Compute the Levenshtein distance; the number of inserted, deleted or                       // 1279
 * substituted characters.                                                                    // 1280
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1281
 * @return {number} Number of changes.                                                        // 1282
 */                                                                                           // 1283
diff_match_patch.prototype.diff_levenshtein = function(diffs) {                               // 1284
  var levenshtein = 0;                                                                        // 1285
  var insertions = 0;                                                                         // 1286
  var deletions = 0;                                                                          // 1287
  for (var x = 0; x < diffs.length; x++) {                                                    // 1288
    var op = diffs[x][0];                                                                     // 1289
    var data = diffs[x][1];                                                                   // 1290
    switch (op) {                                                                             // 1291
      case DIFF_INSERT:                                                                       // 1292
        insertions += data.length;                                                            // 1293
        break;                                                                                // 1294
      case DIFF_DELETE:                                                                       // 1295
        deletions += data.length;                                                             // 1296
        break;                                                                                // 1297
      case DIFF_EQUAL:                                                                        // 1298
        // A deletion and an insertion is one substitution.                                   // 1299
        levenshtein += Math.max(insertions, deletions);                                       // 1300
        insertions = 0;                                                                       // 1301
        deletions = 0;                                                                        // 1302
        break;                                                                                // 1303
    }                                                                                         // 1304
  }                                                                                           // 1305
  levenshtein += Math.max(insertions, deletions);                                             // 1306
  return levenshtein;                                                                         // 1307
};                                                                                            // 1308
                                                                                              // 1309
                                                                                              // 1310
/**                                                                                           // 1311
 * Crush the diff into an encoded string which describes the operations                       // 1312
 * required to transform text1 into text2.                                                    // 1313
 * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.                          // 1314
 * Operations are tab-separated.  Inserted text is escaped using %xx notation.                // 1315
 * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.                       // 1316
 * @return {string} Delta text.                                                               // 1317
 */                                                                                           // 1318
diff_match_patch.prototype.diff_toDelta = function(diffs) {                                   // 1319
  var text = [];                                                                              // 1320
  for (var x = 0; x < diffs.length; x++) {                                                    // 1321
    switch (diffs[x][0]) {                                                                    // 1322
      case DIFF_INSERT:                                                                       // 1323
        text[x] = '+' + encodeURI(diffs[x][1]);                                               // 1324
        break;                                                                                // 1325
      case DIFF_DELETE:                                                                       // 1326
        text[x] = '-' + diffs[x][1].length;                                                   // 1327
        break;                                                                                // 1328
      case DIFF_EQUAL:                                                                        // 1329
        text[x] = '=' + diffs[x][1].length;                                                   // 1330
        break;                                                                                // 1331
    }                                                                                         // 1332
  }                                                                                           // 1333
  return text.join('\t').replace(/%20/g, ' ');                                                // 1334
};                                                                                            // 1335
                                                                                              // 1336
                                                                                              // 1337
/**                                                                                           // 1338
 * Given the original text1, and an encoded string which describes the                        // 1339
 * operations required to transform text1 into text2, compute the full diff.                  // 1340
 * @param {string} text1 Source string for the diff.                                          // 1341
 * @param {string} delta Delta text.                                                          // 1342
 * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.                            // 1343
 * @throws {!Error} If invalid input.                                                         // 1344
 */                                                                                           // 1345
diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {                          // 1346
  var diffs = [];                                                                             // 1347
  var diffsLength = 0;  // Keeping our own length var is faster in JS.                        // 1348
  var pointer = 0;  // Cursor in text1                                                        // 1349
  var tokens = delta.split(/\t/g);                                                            // 1350
  for (var x = 0; x < tokens.length; x++) {                                                   // 1351
    // Each token begins with a one character parameter which specifies the                   // 1352
    // operation of this token (delete, insert, equality).                                    // 1353
    var param = tokens[x].substring(1);                                                       // 1354
    switch (tokens[x].charAt(0)) {                                                            // 1355
      case '+':                                                                               // 1356
        try {                                                                                 // 1357
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];                             // 1358
        } catch (ex) {                                                                        // 1359
          // Malformed URI sequence.                                                          // 1360
          throw new Error('Illegal escape in diff_fromDelta: ' + param);                      // 1361
        }                                                                                     // 1362
        break;                                                                                // 1363
      case '-':                                                                               // 1364
        // Fall through.                                                                      // 1365
      case '=':                                                                               // 1366
        var n = parseInt(param, 10);                                                          // 1367
        if (isNaN(n) || n < 0) {                                                              // 1368
          throw new Error('Invalid number in diff_fromDelta: ' + param);                      // 1369
        }                                                                                     // 1370
        var text = text1.substring(pointer, pointer += n);                                    // 1371
        if (tokens[x].charAt(0) == '=') {                                                     // 1372
          diffs[diffsLength++] = [DIFF_EQUAL, text];                                          // 1373
        } else {                                                                              // 1374
          diffs[diffsLength++] = [DIFF_DELETE, text];                                         // 1375
        }                                                                                     // 1376
        break;                                                                                // 1377
      default:                                                                                // 1378
        // Blank tokens are ok (from a trailing \t).                                          // 1379
        // Anything else is an error.                                                         // 1380
        if (tokens[x]) {                                                                      // 1381
          throw new Error('Invalid diff operation in diff_fromDelta: ' +                      // 1382
                          tokens[x]);                                                         // 1383
        }                                                                                     // 1384
    }                                                                                         // 1385
  }                                                                                           // 1386
  if (pointer != text1.length) {                                                              // 1387
    throw new Error('Delta length (' + pointer +                                              // 1388
        ') does not equal source text length (' + text1.length + ').');                       // 1389
  }                                                                                           // 1390
  return diffs;                                                                               // 1391
};                                                                                            // 1392
                                                                                              // 1393
                                                                                              // 1394
//  MATCH FUNCTIONS                                                                           // 1395
                                                                                              // 1396
                                                                                              // 1397
/**                                                                                           // 1398
 * Locate the best instance of 'pattern' in 'text' near 'loc'.                                // 1399
 * @param {string} text The text to search.                                                   // 1400
 * @param {string} pattern The pattern to search for.                                         // 1401
 * @param {number} loc The location to search around.                                         // 1402
 * @return {number} Best match index or -1.                                                   // 1403
 */                                                                                           // 1404
diff_match_patch.prototype.match_main = function(text, pattern, loc) {                        // 1405
  // Check for null inputs.                                                                   // 1406
  if (text == null || pattern == null || loc == null) {                                       // 1407
    throw new Error('Null input. (match_main)');                                              // 1408
  }                                                                                           // 1409
                                                                                              // 1410
  loc = Math.max(0, Math.min(loc, text.length));                                              // 1411
  if (text == pattern) {                                                                      // 1412
    // Shortcut (potentially not guaranteed by the algorithm)                                 // 1413
    return 0;                                                                                 // 1414
  } else if (!text.length) {                                                                  // 1415
    // Nothing to match.                                                                      // 1416
    return -1;                                                                                // 1417
  } else if (text.substring(loc, loc + pattern.length) == pattern) {                          // 1418
    // Perfect match at the perfect spot!  (Includes case of null pattern)                    // 1419
    return loc;                                                                               // 1420
  } else {                                                                                    // 1421
    // Do a fuzzy compare.                                                                    // 1422
    return this.match_bitap_(text, pattern, loc);                                             // 1423
  }                                                                                           // 1424
};                                                                                            // 1425
                                                                                              // 1426
                                                                                              // 1427
/**                                                                                           // 1428
 * Locate the best instance of 'pattern' in 'text' near 'loc' using the                       // 1429
 * Bitap algorithm.                                                                           // 1430
 * @param {string} text The text to search.                                                   // 1431
 * @param {string} pattern The pattern to search for.                                         // 1432
 * @param {number} loc The location to search around.                                         // 1433
 * @return {number} Best match index or -1.                                                   // 1434
 * @private                                                                                   // 1435
 */                                                                                           // 1436
diff_match_patch.prototype.match_bitap_ = function(text, pattern, loc) {                      // 1437
  if (pattern.length > this.Match_MaxBits) {                                                  // 1438
    throw new Error('Pattern too long for this browser.');                                    // 1439
  }                                                                                           // 1440
                                                                                              // 1441
  // Initialise the alphabet.                                                                 // 1442
  var s = this.match_alphabet_(pattern);                                                      // 1443
                                                                                              // 1444
  var dmp = this;  // 'this' becomes 'window' in a closure.                                   // 1445
                                                                                              // 1446
  /**                                                                                         // 1447
   * Compute and return the score for a match with e errors and x location.                   // 1448
   * Accesses loc and pattern through being a closure.                                        // 1449
   * @param {number} e Number of errors in match.                                             // 1450
   * @param {number} x Location of match.                                                     // 1451
   * @return {number} Overall score for match (0.0 = good, 1.0 = bad).                        // 1452
   * @private                                                                                 // 1453
   */                                                                                         // 1454
  function match_bitapScore_(e, x) {                                                          // 1455
    var accuracy = e / pattern.length;                                                        // 1456
    var proximity = Math.abs(loc - x);                                                        // 1457
    if (!dmp.Match_Distance) {                                                                // 1458
      // Dodge divide by zero error.                                                          // 1459
      return proximity ? 1.0 : accuracy;                                                      // 1460
    }                                                                                         // 1461
    return accuracy + (proximity / dmp.Match_Distance);                                       // 1462
  }                                                                                           // 1463
                                                                                              // 1464
  // Highest score beyond which we give up.                                                   // 1465
  var score_threshold = this.Match_Threshold;                                                 // 1466
  // Is there a nearby exact match? (speedup)                                                 // 1467
  var best_loc = text.indexOf(pattern, loc);                                                  // 1468
  if (best_loc != -1) {                                                                       // 1469
    score_threshold = Math.min(match_bitapScore_(0, best_loc), score_threshold);              // 1470
    // What about in the other direction? (speedup)                                           // 1471
    best_loc = text.lastIndexOf(pattern, loc + pattern.length);                               // 1472
    if (best_loc != -1) {                                                                     // 1473
      score_threshold =                                                                       // 1474
          Math.min(match_bitapScore_(0, best_loc), score_threshold);                          // 1475
    }                                                                                         // 1476
  }                                                                                           // 1477
                                                                                              // 1478
  // Initialise the bit arrays.                                                               // 1479
  var matchmask = 1 << (pattern.length - 1);                                                  // 1480
  best_loc = -1;                                                                              // 1481
                                                                                              // 1482
  var bin_min, bin_mid;                                                                       // 1483
  var bin_max = pattern.length + text.length;                                                 // 1484
  var last_rd;                                                                                // 1485
  for (var d = 0; d < pattern.length; d++) {                                                  // 1486
    // Scan for the best match; each iteration allows for one more error.                     // 1487
    // Run a binary search to determine how far from 'loc' we can stray at this               // 1488
    // error level.                                                                           // 1489
    bin_min = 0;                                                                              // 1490
    bin_mid = bin_max;                                                                        // 1491
    while (bin_min < bin_mid) {                                                               // 1492
      if (match_bitapScore_(d, loc + bin_mid) <= score_threshold) {                           // 1493
        bin_min = bin_mid;                                                                    // 1494
      } else {                                                                                // 1495
        bin_max = bin_mid;                                                                    // 1496
      }                                                                                       // 1497
      bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);                                // 1498
    }                                                                                         // 1499
    // Use the result from this iteration as the maximum for the next.                        // 1500
    bin_max = bin_mid;                                                                        // 1501
    var start = Math.max(1, loc - bin_mid + 1);                                               // 1502
    var finish = Math.min(loc + bin_mid, text.length) + pattern.length;                       // 1503
                                                                                              // 1504
    var rd = Array(finish + 2);                                                               // 1505
    rd[finish + 1] = (1 << d) - 1;                                                            // 1506
    for (var j = finish; j >= start; j--) {                                                   // 1507
      // The alphabet (s) is a sparse hash, so the following line generates                   // 1508
      // warnings.                                                                            // 1509
      var charMatch = s[text.charAt(j - 1)];                                                  // 1510
      if (d === 0) {  // First pass: exact match.                                             // 1511
        rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;                                           // 1512
      } else {  // Subsequent passes: fuzzy match.                                            // 1513
        rd[j] = (((rd[j + 1] << 1) | 1) & charMatch) |                                        // 1514
                (((last_rd[j + 1] | last_rd[j]) << 1) | 1) |                                  // 1515
                last_rd[j + 1];                                                               // 1516
      }                                                                                       // 1517
      if (rd[j] & matchmask) {                                                                // 1518
        var score = match_bitapScore_(d, j - 1);                                              // 1519
        // This match will almost certainly be better than any existing match.                // 1520
        // But check anyway.                                                                  // 1521
        if (score <= score_threshold) {                                                       // 1522
          // Told you so.                                                                     // 1523
          score_threshold = score;                                                            // 1524
          best_loc = j - 1;                                                                   // 1525
          if (best_loc > loc) {                                                               // 1526
            // When passing loc, don't exceed our current distance from loc.                  // 1527
            start = Math.max(1, 2 * loc - best_loc);                                          // 1528
          } else {                                                                            // 1529
            // Already passed loc, downhill from here on in.                                  // 1530
            break;                                                                            // 1531
          }                                                                                   // 1532
        }                                                                                     // 1533
      }                                                                                       // 1534
    }                                                                                         // 1535
    // No hope for a (better) match at greater error levels.                                  // 1536
    if (match_bitapScore_(d + 1, loc) > score_threshold) {                                    // 1537
      break;                                                                                  // 1538
    }                                                                                         // 1539
    last_rd = rd;                                                                             // 1540
  }                                                                                           // 1541
  return best_loc;                                                                            // 1542
};                                                                                            // 1543
                                                                                              // 1544
                                                                                              // 1545
/**                                                                                           // 1546
 * Initialise the alphabet for the Bitap algorithm.                                           // 1547
 * @param {string} pattern The text to encode.                                                // 1548
 * @return {!Object} Hash of character locations.                                             // 1549
 * @private                                                                                   // 1550
 */                                                                                           // 1551
diff_match_patch.prototype.match_alphabet_ = function(pattern) {                              // 1552
  var s = {};                                                                                 // 1553
  for (var i = 0; i < pattern.length; i++) {                                                  // 1554
    s[pattern.charAt(i)] = 0;                                                                 // 1555
  }                                                                                           // 1556
  for (var i = 0; i < pattern.length; i++) {                                                  // 1557
    s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);                                    // 1558
  }                                                                                           // 1559
  return s;                                                                                   // 1560
};                                                                                            // 1561
                                                                                              // 1562
                                                                                              // 1563
//  PATCH FUNCTIONS                                                                           // 1564
                                                                                              // 1565
                                                                                              // 1566
/**                                                                                           // 1567
 * Increase the context until it is unique,                                                   // 1568
 * but don't let the pattern expand beyond Match_MaxBits.                                     // 1569
 * @param {!diff_match_patch.patch_obj} patch The patch to grow.                              // 1570
 * @param {string} text Source text.                                                          // 1571
 * @private                                                                                   // 1572
 */                                                                                           // 1573
diff_match_patch.prototype.patch_addContext_ = function(patch, text) {                        // 1574
  if (text.length == 0) {                                                                     // 1575
    return;                                                                                   // 1576
  }                                                                                           // 1577
  var pattern = text.substring(patch.start2, patch.start2 + patch.length1);                   // 1578
  var padding = 0;                                                                            // 1579
                                                                                              // 1580
  // Look for the first and last matches of pattern in text.  If two different                // 1581
  // matches are found, increase the pattern length.                                          // 1582
  while (text.indexOf(pattern) != text.lastIndexOf(pattern) &&                                // 1583
         pattern.length < this.Match_MaxBits - this.Patch_Margin -                            // 1584
         this.Patch_Margin) {                                                                 // 1585
    padding += this.Patch_Margin;                                                             // 1586
    pattern = text.substring(patch.start2 - padding,                                          // 1587
                             patch.start2 + patch.length1 + padding);                         // 1588
  }                                                                                           // 1589
  // Add one chunk for good luck.                                                             // 1590
  padding += this.Patch_Margin;                                                               // 1591
                                                                                              // 1592
  // Add the prefix.                                                                          // 1593
  var prefix = text.substring(patch.start2 - padding, patch.start2);                          // 1594
  if (prefix) {                                                                               // 1595
    patch.diffs.unshift([DIFF_EQUAL, prefix]);                                                // 1596
  }                                                                                           // 1597
  // Add the suffix.                                                                          // 1598
  var suffix = text.substring(patch.start2 + patch.length1,                                   // 1599
                              patch.start2 + patch.length1 + padding);                        // 1600
  if (suffix) {                                                                               // 1601
    patch.diffs.push([DIFF_EQUAL, suffix]);                                                   // 1602
  }                                                                                           // 1603
                                                                                              // 1604
  // Roll back the start points.                                                              // 1605
  patch.start1 -= prefix.length;                                                              // 1606
  patch.start2 -= prefix.length;                                                              // 1607
  // Extend the lengths.                                                                      // 1608
  patch.length1 += prefix.length + suffix.length;                                             // 1609
  patch.length2 += prefix.length + suffix.length;                                             // 1610
};                                                                                            // 1611
                                                                                              // 1612
                                                                                              // 1613
/**                                                                                           // 1614
 * Compute a list of patches to turn text1 into text2.                                        // 1615
 * Use diffs if provided, otherwise compute it ourselves.                                     // 1616
 * There are four ways to call this function, depending on what data is                       // 1617
 * available to the caller:                                                                   // 1618
 * Method 1:                                                                                  // 1619
 * a = text1, b = text2                                                                       // 1620
 * Method 2:                                                                                  // 1621
 * a = diffs                                                                                  // 1622
 * Method 3 (optimal):                                                                        // 1623
 * a = text1, b = diffs                                                                       // 1624
 * Method 4 (deprecated, use method 3):                                                       // 1625
 * a = text1, b = text2, c = diffs                                                            // 1626
 *                                                                                            // 1627
 * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or                 // 1628
 * Array of diff tuples for text1 to text2 (method 2).                                        // 1629
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_b text2 (methods 1,4) or               // 1630
 * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).                // 1631
 * @param {string|!Array.<!diff_match_patch.Diff>} opt_c Array of diff tuples                 // 1632
 * for text1 to text2 (method 4) or undefined (methods 1,2,3).                                // 1633
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 1634
 */                                                                                           // 1635
diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {                           // 1636
  var text1, diffs;                                                                           // 1637
  if (typeof a == 'string' && typeof opt_b == 'string' &&                                     // 1638
      typeof opt_c == 'undefined') {                                                          // 1639
    // Method 1: text1, text2                                                                 // 1640
    // Compute diffs from text1 and text2.                                                    // 1641
    text1 = /** @type {string} */(a);                                                         // 1642
    diffs = this.diff_main(text1, /** @type {string} */(opt_b), true);                        // 1643
    if (diffs.length > 2) {                                                                   // 1644
      this.diff_cleanupSemantic(diffs);                                                       // 1645
      this.diff_cleanupEfficiency(diffs);                                                     // 1646
    }                                                                                         // 1647
  } else if (a && typeof a == 'object' && typeof opt_b == 'undefined' &&                      // 1648
      typeof opt_c == 'undefined') {                                                          // 1649
    // Method 2: diffs                                                                        // 1650
    // Compute text1 from diffs.                                                              // 1651
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(a);                                // 1652
    text1 = this.diff_text1(diffs);                                                           // 1653
  } else if (typeof a == 'string' && opt_b && typeof opt_b == 'object' &&                     // 1654
      typeof opt_c == 'undefined') {                                                          // 1655
    // Method 3: text1, diffs                                                                 // 1656
    text1 = /** @type {string} */(a);                                                         // 1657
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_b);                            // 1658
  } else if (typeof a == 'string' && typeof opt_b == 'string' &&                              // 1659
      opt_c && typeof opt_c == 'object') {                                                    // 1660
    // Method 4: text1, text2, diffs                                                          // 1661
    // text2 is not used.                                                                     // 1662
    text1 = /** @type {string} */(a);                                                         // 1663
    diffs = /** @type {!Array.<!diff_match_patch.Diff>} */(opt_c);                            // 1664
  } else {                                                                                    // 1665
    throw new Error('Unknown call format to patch_make.');                                    // 1666
  }                                                                                           // 1667
                                                                                              // 1668
  if (diffs.length === 0) {                                                                   // 1669
    return [];  // Get rid of the null case.                                                  // 1670
  }                                                                                           // 1671
  var patches = [];                                                                           // 1672
  var patch = new diff_match_patch.patch_obj();                                               // 1673
  var patchDiffLength = 0;  // Keeping our own length var is faster in JS.                    // 1674
  var char_count1 = 0;  // Number of characters into the text1 string.                        // 1675
  var char_count2 = 0;  // Number of characters into the text2 string.                        // 1676
  // Start with text1 (prepatch_text) and apply the diffs until we arrive at                  // 1677
  // text2 (postpatch_text).  We recreate the patches one by one to determine                 // 1678
  // context info.                                                                            // 1679
  var prepatch_text = text1;                                                                  // 1680
  var postpatch_text = text1;                                                                 // 1681
  for (var x = 0; x < diffs.length; x++) {                                                    // 1682
    var diff_type = diffs[x][0];                                                              // 1683
    var diff_text = diffs[x][1];                                                              // 1684
                                                                                              // 1685
    if (!patchDiffLength && diff_type !== DIFF_EQUAL) {                                       // 1686
      // A new patch starts here.                                                             // 1687
      patch.start1 = char_count1;                                                             // 1688
      patch.start2 = char_count2;                                                             // 1689
    }                                                                                         // 1690
                                                                                              // 1691
    switch (diff_type) {                                                                      // 1692
      case DIFF_INSERT:                                                                       // 1693
        patch.diffs[patchDiffLength++] = diffs[x];                                            // 1694
        patch.length2 += diff_text.length;                                                    // 1695
        postpatch_text = postpatch_text.substring(0, char_count2) + diff_text +               // 1696
                         postpatch_text.substring(char_count2);                               // 1697
        break;                                                                                // 1698
      case DIFF_DELETE:                                                                       // 1699
        patch.length1 += diff_text.length;                                                    // 1700
        patch.diffs[patchDiffLength++] = diffs[x];                                            // 1701
        postpatch_text = postpatch_text.substring(0, char_count2) +                           // 1702
                         postpatch_text.substring(char_count2 +                               // 1703
                             diff_text.length);                                               // 1704
        break;                                                                                // 1705
      case DIFF_EQUAL:                                                                        // 1706
        if (diff_text.length <= 2 * this.Patch_Margin &&                                      // 1707
            patchDiffLength && diffs.length != x + 1) {                                       // 1708
          // Small equality inside a patch.                                                   // 1709
          patch.diffs[patchDiffLength++] = diffs[x];                                          // 1710
          patch.length1 += diff_text.length;                                                  // 1711
          patch.length2 += diff_text.length;                                                  // 1712
        } else if (diff_text.length >= 2 * this.Patch_Margin) {                               // 1713
          // Time for a new patch.                                                            // 1714
          if (patchDiffLength) {                                                              // 1715
            this.patch_addContext_(patch, prepatch_text);                                     // 1716
            patches.push(patch);                                                              // 1717
            patch = new diff_match_patch.patch_obj();                                         // 1718
            patchDiffLength = 0;                                                              // 1719
            // Unlike Unidiff, our patch lists have a rolling context.                        // 1720
            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff                  // 1721
            // Update prepatch text & pos to reflect the application of the                   // 1722
            // just completed patch.                                                          // 1723
            prepatch_text = postpatch_text;                                                   // 1724
            char_count1 = char_count2;                                                        // 1725
          }                                                                                   // 1726
        }                                                                                     // 1727
        break;                                                                                // 1728
    }                                                                                         // 1729
                                                                                              // 1730
    // Update the current character count.                                                    // 1731
    if (diff_type !== DIFF_INSERT) {                                                          // 1732
      char_count1 += diff_text.length;                                                        // 1733
    }                                                                                         // 1734
    if (diff_type !== DIFF_DELETE) {                                                          // 1735
      char_count2 += diff_text.length;                                                        // 1736
    }                                                                                         // 1737
  }                                                                                           // 1738
  // Pick up the leftover patch if not empty.                                                 // 1739
  if (patchDiffLength) {                                                                      // 1740
    this.patch_addContext_(patch, prepatch_text);                                             // 1741
    patches.push(patch);                                                                      // 1742
  }                                                                                           // 1743
                                                                                              // 1744
  return patches;                                                                             // 1745
};                                                                                            // 1746
                                                                                              // 1747
                                                                                              // 1748
/**                                                                                           // 1749
 * Given an array of patches, return another array that is identical.                         // 1750
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1751
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 1752
 */                                                                                           // 1753
diff_match_patch.prototype.patch_deepCopy = function(patches) {                               // 1754
  // Making deep copies is hard in JavaScript.                                                // 1755
  var patchesCopy = [];                                                                       // 1756
  for (var x = 0; x < patches.length; x++) {                                                  // 1757
    var patch = patches[x];                                                                   // 1758
    var patchCopy = new diff_match_patch.patch_obj();                                         // 1759
    patchCopy.diffs = [];                                                                     // 1760
    for (var y = 0; y < patch.diffs.length; y++) {                                            // 1761
      patchCopy.diffs[y] = patch.diffs[y].slice();                                            // 1762
    }                                                                                         // 1763
    patchCopy.start1 = patch.start1;                                                          // 1764
    patchCopy.start2 = patch.start2;                                                          // 1765
    patchCopy.length1 = patch.length1;                                                        // 1766
    patchCopy.length2 = patch.length2;                                                        // 1767
    patchesCopy[x] = patchCopy;                                                               // 1768
  }                                                                                           // 1769
  return patchesCopy;                                                                         // 1770
};                                                                                            // 1771
                                                                                              // 1772
                                                                                              // 1773
/**                                                                                           // 1774
 * Merge a set of patches onto the text.  Return a patched text, as well                      // 1775
 * as a list of true/false values indicating which patches were applied.                      // 1776
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1777
 * @param {string} text Old text.                                                             // 1778
 * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the               // 1779
 *      new text and an array of boolean values.                                              // 1780
 */                                                                                           // 1781
diff_match_patch.prototype.patch_apply = function(patches, text) {                            // 1782
  if (patches.length == 0) {                                                                  // 1783
    return [text, []];                                                                        // 1784
  }                                                                                           // 1785
                                                                                              // 1786
  // Deep copy the patches so that no changes are made to originals.                          // 1787
  patches = this.patch_deepCopy(patches);                                                     // 1788
                                                                                              // 1789
  var nullPadding = this.patch_addPadding(patches);                                           // 1790
  text = nullPadding + text + nullPadding;                                                    // 1791
                                                                                              // 1792
  this.patch_splitMax(patches);                                                               // 1793
  // delta keeps track of the offset between the expected and actual location                 // 1794
  // of the previous patch.  If there are patches expected at positions 10 and                // 1795
  // 20, but the first patch was found at 12, delta is 2 and the second patch                 // 1796
  // has an effective expected position of 22.                                                // 1797
  var delta = 0;                                                                              // 1798
  var results = [];                                                                           // 1799
  for (var x = 0; x < patches.length; x++) {                                                  // 1800
    var expected_loc = patches[x].start2 + delta;                                             // 1801
    var text1 = this.diff_text1(patches[x].diffs);                                            // 1802
    var start_loc;                                                                            // 1803
    var end_loc = -1;                                                                         // 1804
    if (text1.length > this.Match_MaxBits) {                                                  // 1805
      // patch_splitMax will only provide an oversized pattern in the case of                 // 1806
      // a monster delete.                                                                    // 1807
      start_loc = this.match_main(text, text1.substring(0, this.Match_MaxBits),               // 1808
                                  expected_loc);                                              // 1809
      if (start_loc != -1) {                                                                  // 1810
        end_loc = this.match_main(text,                                                       // 1811
            text1.substring(text1.length - this.Match_MaxBits),                               // 1812
            expected_loc + text1.length - this.Match_MaxBits);                                // 1813
        if (end_loc == -1 || start_loc >= end_loc) {                                          // 1814
          // Can't find valid trailing context.  Drop this patch.                             // 1815
          start_loc = -1;                                                                     // 1816
        }                                                                                     // 1817
      }                                                                                       // 1818
    } else {                                                                                  // 1819
      start_loc = this.match_main(text, text1, expected_loc);                                 // 1820
    }                                                                                         // 1821
    if (start_loc == -1) {                                                                    // 1822
      // No match found.  :(                                                                  // 1823
      results[x] = false;                                                                     // 1824
      // Subtract the delta for this failed patch from subsequent patches.                    // 1825
      delta -= patches[x].length2 - patches[x].length1;                                       // 1826
    } else {                                                                                  // 1827
      // Found a match.  :)                                                                   // 1828
      results[x] = true;                                                                      // 1829
      delta = start_loc - expected_loc;                                                       // 1830
      var text2;                                                                              // 1831
      if (end_loc == -1) {                                                                    // 1832
        text2 = text.substring(start_loc, start_loc + text1.length);                          // 1833
      } else {                                                                                // 1834
        text2 = text.substring(start_loc, end_loc + this.Match_MaxBits);                      // 1835
      }                                                                                       // 1836
      if (text1 == text2) {                                                                   // 1837
        // Perfect match, just shove the replacement text in.                                 // 1838
        text = text.substring(0, start_loc) +                                                 // 1839
               this.diff_text2(patches[x].diffs) +                                            // 1840
               text.substring(start_loc + text1.length);                                      // 1841
      } else {                                                                                // 1842
        // Imperfect match.  Run a diff to get a framework of equivalent                      // 1843
        // indices.                                                                           // 1844
        var diffs = this.diff_main(text1, text2, false);                                      // 1845
        if (text1.length > this.Match_MaxBits &&                                              // 1846
            this.diff_levenshtein(diffs) / text1.length >                                     // 1847
            this.Patch_DeleteThreshold) {                                                     // 1848
          // The end points match, but the content is unacceptably bad.                       // 1849
          results[x] = false;                                                                 // 1850
        } else {                                                                              // 1851
          this.diff_cleanupSemanticLossless(diffs);                                           // 1852
          var index1 = 0;                                                                     // 1853
          var index2;                                                                         // 1854
          for (var y = 0; y < patches[x].diffs.length; y++) {                                 // 1855
            var mod = patches[x].diffs[y];                                                    // 1856
            if (mod[0] !== DIFF_EQUAL) {                                                      // 1857
              index2 = this.diff_xIndex(diffs, index1);                                       // 1858
            }                                                                                 // 1859
            if (mod[0] === DIFF_INSERT) {  // Insertion                                       // 1860
              text = text.substring(0, start_loc + index2) + mod[1] +                         // 1861
                     text.substring(start_loc + index2);                                      // 1862
            } else if (mod[0] === DIFF_DELETE) {  // Deletion                                 // 1863
              text = text.substring(0, start_loc + index2) +                                  // 1864
                     text.substring(start_loc + this.diff_xIndex(diffs,                       // 1865
                         index1 + mod[1].length));                                            // 1866
            }                                                                                 // 1867
            if (mod[0] !== DIFF_DELETE) {                                                     // 1868
              index1 += mod[1].length;                                                        // 1869
            }                                                                                 // 1870
          }                                                                                   // 1871
        }                                                                                     // 1872
      }                                                                                       // 1873
    }                                                                                         // 1874
  }                                                                                           // 1875
  // Strip the padding off.                                                                   // 1876
  text = text.substring(nullPadding.length, text.length - nullPadding.length);                // 1877
  return [text, results];                                                                     // 1878
};                                                                                            // 1879
                                                                                              // 1880
                                                                                              // 1881
/**                                                                                           // 1882
 * Add some padding on text start and end so that edges can match something.                  // 1883
 * Intended to be called only from within patch_apply.                                        // 1884
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1885
 * @return {string} The padding string added to each side.                                    // 1886
 */                                                                                           // 1887
diff_match_patch.prototype.patch_addPadding = function(patches) {                             // 1888
  var paddingLength = this.Patch_Margin;                                                      // 1889
  var nullPadding = '';                                                                       // 1890
  for (var x = 1; x <= paddingLength; x++) {                                                  // 1891
    nullPadding += String.fromCharCode(x);                                                    // 1892
  }                                                                                           // 1893
                                                                                              // 1894
  // Bump all the patches forward.                                                            // 1895
  for (var x = 0; x < patches.length; x++) {                                                  // 1896
    patches[x].start1 += paddingLength;                                                       // 1897
    patches[x].start2 += paddingLength;                                                       // 1898
  }                                                                                           // 1899
                                                                                              // 1900
  // Add some padding on start of first diff.                                                 // 1901
  var patch = patches[0];                                                                     // 1902
  var diffs = patch.diffs;                                                                    // 1903
  if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {                                       // 1904
    // Add nullPadding equality.                                                              // 1905
    diffs.unshift([DIFF_EQUAL, nullPadding]);                                                 // 1906
    patch.start1 -= paddingLength;  // Should be 0.                                           // 1907
    patch.start2 -= paddingLength;  // Should be 0.                                           // 1908
    patch.length1 += paddingLength;                                                           // 1909
    patch.length2 += paddingLength;                                                           // 1910
  } else if (paddingLength > diffs[0][1].length) {                                            // 1911
    // Grow first equality.                                                                   // 1912
    var extraLength = paddingLength - diffs[0][1].length;                                     // 1913
    diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];                    // 1914
    patch.start1 -= extraLength;                                                              // 1915
    patch.start2 -= extraLength;                                                              // 1916
    patch.length1 += extraLength;                                                             // 1917
    patch.length2 += extraLength;                                                             // 1918
  }                                                                                           // 1919
                                                                                              // 1920
  // Add some padding on end of last diff.                                                    // 1921
  patch = patches[patches.length - 1];                                                        // 1922
  diffs = patch.diffs;                                                                        // 1923
  if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {                        // 1924
    // Add nullPadding equality.                                                              // 1925
    diffs.push([DIFF_EQUAL, nullPadding]);                                                    // 1926
    patch.length1 += paddingLength;                                                           // 1927
    patch.length2 += paddingLength;                                                           // 1928
  } else if (paddingLength > diffs[diffs.length - 1][1].length) {                             // 1929
    // Grow last equality.                                                                    // 1930
    var extraLength = paddingLength - diffs[diffs.length - 1][1].length;                      // 1931
    diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);                      // 1932
    patch.length1 += extraLength;                                                             // 1933
    patch.length2 += extraLength;                                                             // 1934
  }                                                                                           // 1935
                                                                                              // 1936
  return nullPadding;                                                                         // 1937
};                                                                                            // 1938
                                                                                              // 1939
                                                                                              // 1940
/**                                                                                           // 1941
 * Look through the patches and break up any which are longer than the maximum                // 1942
 * limit of the match algorithm.                                                              // 1943
 * Intended to be called only from within patch_apply.                                        // 1944
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 1945
 */                                                                                           // 1946
diff_match_patch.prototype.patch_splitMax = function(patches) {                               // 1947
  var patch_size = this.Match_MaxBits;                                                        // 1948
  for (var x = 0; x < patches.length; x++) {                                                  // 1949
    if (patches[x].length1 <= patch_size) {                                                   // 1950
      continue;                                                                               // 1951
    }                                                                                         // 1952
    var bigpatch = patches[x];                                                                // 1953
    // Remove the big old patch.                                                              // 1954
    patches.splice(x--, 1);                                                                   // 1955
    var start1 = bigpatch.start1;                                                             // 1956
    var start2 = bigpatch.start2;                                                             // 1957
    var precontext = '';                                                                      // 1958
    while (bigpatch.diffs.length !== 0) {                                                     // 1959
      // Create one of several smaller patches.                                               // 1960
      var patch = new diff_match_patch.patch_obj();                                           // 1961
      var empty = true;                                                                       // 1962
      patch.start1 = start1 - precontext.length;                                              // 1963
      patch.start2 = start2 - precontext.length;                                              // 1964
      if (precontext !== '') {                                                                // 1965
        patch.length1 = patch.length2 = precontext.length;                                    // 1966
        patch.diffs.push([DIFF_EQUAL, precontext]);                                           // 1967
      }                                                                                       // 1968
      while (bigpatch.diffs.length !== 0 &&                                                   // 1969
             patch.length1 < patch_size - this.Patch_Margin) {                                // 1970
        var diff_type = bigpatch.diffs[0][0];                                                 // 1971
        var diff_text = bigpatch.diffs[0][1];                                                 // 1972
        if (diff_type === DIFF_INSERT) {                                                      // 1973
          // Insertions are harmless.                                                         // 1974
          patch.length2 += diff_text.length;                                                  // 1975
          start2 += diff_text.length;                                                         // 1976
          patch.diffs.push(bigpatch.diffs.shift());                                           // 1977
          empty = false;                                                                      // 1978
        } else if (diff_type === DIFF_DELETE && patch.diffs.length == 1 &&                    // 1979
                   patch.diffs[0][0] == DIFF_EQUAL &&                                         // 1980
                   diff_text.length > 2 * patch_size) {                                       // 1981
          // This is a large deletion.  Let it pass in one chunk.                             // 1982
          patch.length1 += diff_text.length;                                                  // 1983
          start1 += diff_text.length;                                                         // 1984
          empty = false;                                                                      // 1985
          patch.diffs.push([diff_type, diff_text]);                                           // 1986
          bigpatch.diffs.shift();                                                             // 1987
        } else {                                                                              // 1988
          // Deletion or equality.  Only take as much as we can stomach.                      // 1989
          diff_text = diff_text.substring(0,                                                  // 1990
              patch_size - patch.length1 - this.Patch_Margin);                                // 1991
          patch.length1 += diff_text.length;                                                  // 1992
          start1 += diff_text.length;                                                         // 1993
          if (diff_type === DIFF_EQUAL) {                                                     // 1994
            patch.length2 += diff_text.length;                                                // 1995
            start2 += diff_text.length;                                                       // 1996
          } else {                                                                            // 1997
            empty = false;                                                                    // 1998
          }                                                                                   // 1999
          patch.diffs.push([diff_type, diff_text]);                                           // 2000
          if (diff_text == bigpatch.diffs[0][1]) {                                            // 2001
            bigpatch.diffs.shift();                                                           // 2002
          } else {                                                                            // 2003
            bigpatch.diffs[0][1] =                                                            // 2004
                bigpatch.diffs[0][1].substring(diff_text.length);                             // 2005
          }                                                                                   // 2006
        }                                                                                     // 2007
      }                                                                                       // 2008
      // Compute the head context for the next patch.                                         // 2009
      precontext = this.diff_text2(patch.diffs);                                              // 2010
      precontext =                                                                            // 2011
          precontext.substring(precontext.length - this.Patch_Margin);                        // 2012
      // Append the end context for this patch.                                               // 2013
      var postcontext = this.diff_text1(bigpatch.diffs)                                       // 2014
                            .substring(0, this.Patch_Margin);                                 // 2015
      if (postcontext !== '') {                                                               // 2016
        patch.length1 += postcontext.length;                                                  // 2017
        patch.length2 += postcontext.length;                                                  // 2018
        if (patch.diffs.length !== 0 &&                                                       // 2019
            patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {                          // 2020
          patch.diffs[patch.diffs.length - 1][1] += postcontext;                              // 2021
        } else {                                                                              // 2022
          patch.diffs.push([DIFF_EQUAL, postcontext]);                                        // 2023
        }                                                                                     // 2024
      }                                                                                       // 2025
      if (!empty) {                                                                           // 2026
        patches.splice(++x, 0, patch);                                                        // 2027
      }                                                                                       // 2028
    }                                                                                         // 2029
  }                                                                                           // 2030
};                                                                                            // 2031
                                                                                              // 2032
                                                                                              // 2033
/**                                                                                           // 2034
 * Take a list of patches and return a textual representation.                                // 2035
 * @param {!Array.<!diff_match_patch.patch_obj>} patches Array of Patch objects.              // 2036
 * @return {string} Text representation of patches.                                           // 2037
 */                                                                                           // 2038
diff_match_patch.prototype.patch_toText = function(patches) {                                 // 2039
  var text = [];                                                                              // 2040
  for (var x = 0; x < patches.length; x++) {                                                  // 2041
    text[x] = patches[x];                                                                     // 2042
  }                                                                                           // 2043
  return text.join('');                                                                       // 2044
};                                                                                            // 2045
                                                                                              // 2046
                                                                                              // 2047
/**                                                                                           // 2048
 * Parse a textual representation of patches and return a list of Patch objects.              // 2049
 * @param {string} textline Text representation of patches.                                   // 2050
 * @return {!Array.<!diff_match_patch.patch_obj>} Array of Patch objects.                     // 2051
 * @throws {!Error} If invalid input.                                                         // 2052
 */                                                                                           // 2053
diff_match_patch.prototype.patch_fromText = function(textline) {                              // 2054
  var patches = [];                                                                           // 2055
  if (!textline) {                                                                            // 2056
    return patches;                                                                           // 2057
  }                                                                                           // 2058
  var text = textline.split('\n');                                                            // 2059
  var textPointer = 0;                                                                        // 2060
  var patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;                                   // 2061
  while (textPointer < text.length) {                                                         // 2062
    var m = text[textPointer].match(patchHeader);                                             // 2063
    if (!m) {                                                                                 // 2064
      throw new Error('Invalid patch string: ' + text[textPointer]);                          // 2065
    }                                                                                         // 2066
    var patch = new diff_match_patch.patch_obj();                                             // 2067
    patches.push(patch);                                                                      // 2068
    patch.start1 = parseInt(m[1], 10);                                                        // 2069
    if (m[2] === '') {                                                                        // 2070
      patch.start1--;                                                                         // 2071
      patch.length1 = 1;                                                                      // 2072
    } else if (m[2] == '0') {                                                                 // 2073
      patch.length1 = 0;                                                                      // 2074
    } else {                                                                                  // 2075
      patch.start1--;                                                                         // 2076
      patch.length1 = parseInt(m[2], 10);                                                     // 2077
    }                                                                                         // 2078
                                                                                              // 2079
    patch.start2 = parseInt(m[3], 10);                                                        // 2080
    if (m[4] === '') {                                                                        // 2081
      patch.start2--;                                                                         // 2082
      patch.length2 = 1;                                                                      // 2083
    } else if (m[4] == '0') {                                                                 // 2084
      patch.length2 = 0;                                                                      // 2085
    } else {                                                                                  // 2086
      patch.start2--;                                                                         // 2087
      patch.length2 = parseInt(m[4], 10);                                                     // 2088
    }                                                                                         // 2089
    textPointer++;                                                                            // 2090
                                                                                              // 2091
    while (textPointer < text.length) {                                                       // 2092
      var sign = text[textPointer].charAt(0);                                                 // 2093
      try {                                                                                   // 2094
        var line = decodeURI(text[textPointer].substring(1));                                 // 2095
      } catch (ex) {                                                                          // 2096
        // Malformed URI sequence.                                                            // 2097
        throw new Error('Illegal escape in patch_fromText: ' + line);                         // 2098
      }                                                                                       // 2099
      if (sign == '-') {                                                                      // 2100
        // Deletion.                                                                          // 2101
        patch.diffs.push([DIFF_DELETE, line]);                                                // 2102
      } else if (sign == '+') {                                                               // 2103
        // Insertion.                                                                         // 2104
        patch.diffs.push([DIFF_INSERT, line]);                                                // 2105
      } else if (sign == ' ') {                                                               // 2106
        // Minor equality.                                                                    // 2107
        patch.diffs.push([DIFF_EQUAL, line]);                                                 // 2108
      } else if (sign == '@') {                                                               // 2109
        // Start of next patch.                                                               // 2110
        break;                                                                                // 2111
      } else if (sign === '') {                                                               // 2112
        // Blank line?  Whatever.                                                             // 2113
      } else {                                                                                // 2114
        // WTF?                                                                               // 2115
        throw new Error('Invalid patch mode "' + sign + '" in: ' + line);                     // 2116
      }                                                                                       // 2117
      textPointer++;                                                                          // 2118
    }                                                                                         // 2119
  }                                                                                           // 2120
  return patches;                                                                             // 2121
};                                                                                            // 2122
                                                                                              // 2123
                                                                                              // 2124
/**                                                                                           // 2125
 * Class representing one patch operation.                                                    // 2126
 * @constructor                                                                               // 2127
 */                                                                                           // 2128
diff_match_patch.patch_obj = function() {                                                     // 2129
  /** @type {!Array.<!diff_match_patch.Diff>} */                                              // 2130
  this.diffs = [];                                                                            // 2131
  /** @type {?number} */                                                                      // 2132
  this.start1 = null;                                                                         // 2133
  /** @type {?number} */                                                                      // 2134
  this.start2 = null;                                                                         // 2135
  /** @type {number} */                                                                       // 2136
  this.length1 = 0;                                                                           // 2137
  /** @type {number} */                                                                       // 2138
  this.length2 = 0;                                                                           // 2139
};                                                                                            // 2140
                                                                                              // 2141
                                                                                              // 2142
/**                                                                                           // 2143
 * Emmulate GNU diff's format.                                                                // 2144
 * Header: @@ -382,8 +481,9 @@                                                                // 2145
 * Indicies are printed as 1-based, not 0-based.                                              // 2146
 * @return {string} The GNU diff string.                                                      // 2147
 */                                                                                           // 2148
diff_match_patch.patch_obj.prototype.toString = function() {                                  // 2149
  var coords1, coords2;                                                                       // 2150
  if (this.length1 === 0) {                                                                   // 2151
    coords1 = this.start1 + ',0';                                                             // 2152
  } else if (this.length1 == 1) {                                                             // 2153
    coords1 = this.start1 + 1;                                                                // 2154
  } else {                                                                                    // 2155
    coords1 = (this.start1 + 1) + ',' + this.length1;                                         // 2156
  }                                                                                           // 2157
  if (this.length2 === 0) {                                                                   // 2158
    coords2 = this.start2 + ',0';                                                             // 2159
  } else if (this.length2 == 1) {                                                             // 2160
    coords2 = this.start2 + 1;                                                                // 2161
  } else {                                                                                    // 2162
    coords2 = (this.start2 + 1) + ',' + this.length2;                                         // 2163
  }                                                                                           // 2164
  var text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];                                   // 2165
  var op;                                                                                     // 2166
  // Escape the body of the patch with %xx notation.                                          // 2167
  for (var x = 0; x < this.diffs.length; x++) {                                               // 2168
    switch (this.diffs[x][0]) {                                                               // 2169
      case DIFF_INSERT:                                                                       // 2170
        op = '+';                                                                             // 2171
        break;                                                                                // 2172
      case DIFF_DELETE:                                                                       // 2173
        op = '-';                                                                             // 2174
        break;                                                                                // 2175
      case DIFF_EQUAL:                                                                        // 2176
        op = ' ';                                                                             // 2177
        break;                                                                                // 2178
    }                                                                                         // 2179
    text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';                                    // 2180
  }                                                                                           // 2181
  return text.join('').replace(/%20/g, ' ');                                                  // 2182
};                                                                                            // 2183
                                                                                              // 2184
                                                                                              // 2185
// Export these global variables so that they survive Google's JS compiler.                   // 2186
// In a browser, 'this' will be 'window'.                                                     // 2187
// Users of node.js should 'require' the uncompressed version since Google's                  // 2188
// JS compiler may break the following exports for non-browser environments.                  // 2189
this['diff_match_patch'] = diff_match_patch;                                                  // 2190
this['DIFF_DELETE'] = DIFF_DELETE;                                                            // 2191
this['DIFF_INSERT'] = DIFF_INSERT;                                                            // 2192
this['DIFF_EQUAL'] = DIFF_EQUAL;                                                              // 2193
                                                                                              // 2194
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/test-in-browser/template.driver.js                                                //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
                                                                                              // 1
Template.body.addContent((function() {                                                        // 2
  var view = this;                                                                            // 3
  return HTML.DIV({                                                                           // 4
    "class": "container-fluid"                                                                // 5
  }, "\n  ", Spacebars.include(view.lookupTemplate("navBars")), "\n  ", Spacebars.include(view.lookupTemplate("failedTests")), "\n  ", Spacebars.include(view.lookupTemplate("testTable")), "\n  ");
}));                                                                                          // 7
Meteor.startup(Template.body.renderToDocument);                                               // 8
                                                                                              // 9
Template.__checkName("navBars");                                                              // 10
Template["navBars"] = new Template("Template.navBars", (function() {                          // 11
  var view = this;                                                                            // 12
  return [ HTML.DIV({                                                                         // 13
    "class": "navbar navbar-fixed-top navbar-inverse"                                         // 14
  }, "\n    ", HTML.DIV({                                                                     // 15
    "class": "navbar-inner"                                                                   // 16
  }, "\n      ", HTML.DIV({                                                                   // 17
    "class": "row-fluid"                                                                      // 18
  }, "\n        ", HTML.DIV({                                                                 // 19
    "class": "span3"                                                                          // 20
  }, HTML.A({                                                                                 // 21
    "class": "brand",                                                                         // 22
    href: "#"                                                                                 // 23
  }, "\n          ", HTML.Raw("&nbsp;"), "\n          ", Blaze.If(function() {                // 24
    return Spacebars.call(view.lookup("running"));                                            // 25
  }, function() {                                                                             // 26
    return "\n            Testing in progress...\n          ";                                // 27
  }, function() {                                                                             // 28
    return [ "\n            ", Blaze.If(function() {                                          // 29
      return Spacebars.call(view.lookup("passed"));                                           // 30
    }, function() {                                                                           // 31
      return "\n              All tests pass!\n            ";                                 // 32
    }, function() {                                                                           // 33
      return "\n              There are failures.\n            ";                             // 34
    }), "\n          " ];                                                                     // 35
  }), "\n        ")), "\n        ", HTML.DIV({                                                // 36
    "class": "span2"                                                                          // 37
  }, "\n          ", Blaze.Unless(function() {                                                // 38
    return Spacebars.call(view.lookup("running"));                                            // 39
  }, function() {                                                                             // 40
    return [ "\n            ", HTML.P({                                                       // 41
      "class": "navbar-text"                                                                  // 42
    }, Blaze.View("lookup:total_test_time", function() {                                      // 43
      return Spacebars.mustache(view.lookup("total_test_time"));                              // 44
    }), " ms"), "\n          " ];                                                             // 45
  }), "\n        "), "\n        ", HTML.DIV({                                                 // 46
    "class": "span6"                                                                          // 47
  }, "\n          ", Spacebars.include(view.lookupTemplate("progressBar")), "\n        "), "\n        ", HTML.Raw('<div class="span1"></div>'), "\n      "), "\n    "), "\n  "), "\n  ", Spacebars.include(view.lookupTemplate("groupNav")) ];
}));                                                                                          // 49
                                                                                              // 50
Template.__checkName("progressBar");                                                          // 51
Template["progressBar"] = new Template("Template.progressBar", (function() {                  // 52
  var view = this;                                                                            // 53
  return HTML.DIV({                                                                           // 54
    id: "testProgressBar",                                                                    // 55
    "class": function() {                                                                     // 56
      return [ "progress ", Spacebars.mustache(view.lookup("barOuterClass")) ];               // 57
    }                                                                                         // 58
  }, "\n    ", HTML.SPAN({                                                                    // 59
    "class": "in-progress"                                                                    // 60
  }, "Passed ", Blaze.View("lookup:passedCount", function() {                                 // 61
    return Spacebars.mustache(view.lookup("passedCount"));                                    // 62
  }), " of ", Blaze.View("lookup:totalCount", function() {                                    // 63
    return Spacebars.mustache(view.lookup("totalCount"));                                     // 64
  })), "\n    ", HTML.DIV({                                                                   // 65
    "class": "bar bar-danger",                                                                // 66
    style: function() {                                                                       // 67
      return [ "width: ", Spacebars.mustache(view.lookup("percentFail")), "%;" ];             // 68
    }                                                                                         // 69
  }), "\n    ", HTML.DIV({                                                                    // 70
    "class": function() {                                                                     // 71
      return [ "bar ", Spacebars.mustache(view.lookup("barInnerClass")) ];                    // 72
    },                                                                                        // 73
    style: function() {                                                                       // 74
      return [ "width: ", Spacebars.mustache(view.lookup("percentPass")), "%;" ];             // 75
    }                                                                                         // 76
  }), "\n  ");                                                                                // 77
}));                                                                                          // 78
                                                                                              // 79
Template.__checkName("groupNav");                                                             // 80
Template["groupNav"] = new Template("Template.groupNav", (function() {                        // 81
  var view = this;                                                                            // 82
  return HTML.DIV({                                                                           // 83
    "class": "navbar navbar-fixed-bottom navbar-inverse"                                      // 84
  }, "\n    ", HTML.DIV({                                                                     // 85
    "class": "navbar-inner"                                                                   // 86
  }, "\n      ", HTML.UL({                                                                    // 87
    "class": "nav"                                                                            // 88
  }, "\n      ", Blaze.Each(function() {                                                      // 89
    return Spacebars.call(view.lookup("groupPaths"));                                         // 90
  }, function() {                                                                             // 91
    return [ "\n        ", HTML.LI({                                                          // 92
      "class": "navbar-text"                                                                  // 93
    }, HTML.CharRef({                                                                         // 94
      html: "&nbsp;",                                                                         // 95
      str: " "                                                                                // 96
    }), "-", HTML.CharRef({                                                                   // 97
      html: "&nbsp;",                                                                         // 98
      str: " "                                                                                // 99
    })), "\n        ", HTML.LI(HTML.A({                                                       // 100
      "class": "group",                                                                       // 101
      href: "#"                                                                               // 102
    }, Blaze.View("lookup:name", function() {                                                 // 103
      return Spacebars.mustache(view.lookup("name"));                                         // 104
    }))), "\n      " ];                                                                       // 105
  }), "\n      "), "\n      ", HTML.FORM({                                                    // 106
    "class": "navbar-form pull-right"                                                         // 107
  }, "\n        ", HTML.Raw('<span id="current-client-test"></span>'), "\n        ", HTML.A({ // 108
    "class": "btn rerun"                                                                      // 109
  }, "\n          ", Blaze.If(function() {                                                    // 110
    return Spacebars.call(view.lookup("rerunScheduled"));                                     // 111
  }, function() {                                                                             // 112
    return [ "\n          ", HTML.I({                                                         // 113
      "class": "icon-time"                                                                    // 114
    }), "\n          Rerun scheduled...\n          " ];                                       // 115
  }, function() {                                                                             // 116
    return [ "\n          ", HTML.I({                                                         // 117
      "class": "icon-repeat"                                                                  // 118
    }), "\n          Rerun\n          " ];                                                    // 119
  }), "\n        "), "\n      "), "\n      ", HTML.Raw("&nbsp;"), "\n    "), "\n  ");         // 120
}));                                                                                          // 121
                                                                                              // 122
Template.__checkName("failedTests");                                                          // 123
Template["failedTests"] = new Template("Template.failedTests", (function() {                  // 124
  var view = this;                                                                            // 125
  return HTML.DIV({                                                                           // 126
    "class": "row-fluid"                                                                      // 127
  }, HTML.DIV({                                                                               // 128
    "class": "span12"                                                                         // 129
  }, "\n  ", HTML.UL({                                                                        // 130
    "class": "failedTests"                                                                    // 131
  }, "\n    ", Blaze.Each(function() {                                                        // 132
    return Spacebars.call(view.lookup("failedTests"));                                        // 133
  }, function() {                                                                             // 134
    return [ "\n      ", HTML.LI(Blaze.View("lookup:.", function() {                          // 135
      return Spacebars.mustache(view.lookup("."));                                            // 136
    })), "\n    " ];                                                                          // 137
  }), "\n  "), "\n  "));                                                                      // 138
}));                                                                                          // 139
                                                                                              // 140
Template.__checkName("testTable");                                                            // 141
Template["testTable"] = new Template("Template.testTable", (function() {                      // 142
  var view = this;                                                                            // 143
  return HTML.DIV({                                                                           // 144
    "class": "row-fluid"                                                                      // 145
  }, HTML.DIV({                                                                               // 146
    "class": "span12"                                                                         // 147
  }, "\n  ", HTML.DIV({                                                                       // 148
    "class": "test_table"                                                                     // 149
  }, "\n    ", Blaze.Each(function() {                                                        // 150
    return Spacebars.call(view.lookup("testdata"));                                           // 151
  }, function() {                                                                             // 152
    return [ "\n      ", Blaze._TemplateWith(function() {                                     // 153
      return Spacebars.call(view.lookup("thisWithDep"));                                      // 154
    }, function() {                                                                           // 155
      return Spacebars.include(view.lookupTemplate("test_group"));                            // 156
    }), "\n    " ];                                                                           // 157
  }), "\n  "), "\n  "));                                                                      // 158
}));                                                                                          // 159
                                                                                              // 160
Template.__checkName("test_group");                                                           // 161
Template["test_group"] = new Template("Template.test_group", (function() {                    // 162
  var view = this;                                                                            // 163
  return HTML.DIV({                                                                           // 164
    "class": "group"                                                                          // 165
  }, "\n    ", HTML.DIV({                                                                     // 166
    "class": "groupname"                                                                      // 167
  }, HTML.A(Blaze.View("lookup:name", function() {                                            // 168
    return Spacebars.mustache(view.lookup("name"));                                           // 169
  }))), "\n    ", Blaze.Each(function() {                                                     // 170
    return Spacebars.call(view.lookup("tests"));                                              // 171
  }, function() {                                                                             // 172
    return [ "\n      ", Blaze._TemplateWith(function() {                                     // 173
      return Spacebars.call(view.lookup("thisWithDep"));                                      // 174
    }, function() {                                                                           // 175
      return Spacebars.include(view.lookupTemplate("test"));                                  // 176
    }), "\n    " ];                                                                           // 177
  }), "\n    ", Blaze.Each(function() {                                                       // 178
    return Spacebars.call(view.lookup("groups"));                                             // 179
  }, function() {                                                                             // 180
    return [ "\n      ", Blaze._TemplateWith(function() {                                     // 181
      return Spacebars.call(view.lookup("thisWithDep"));                                      // 182
    }, function() {                                                                           // 183
      return Spacebars.include(view.lookupTemplate("test_group"));                            // 184
    }), "\n    " ];                                                                           // 185
  }), "\n  ");                                                                                // 186
}));                                                                                          // 187
                                                                                              // 188
Template.__checkName("test");                                                                 // 189
Template["test"] = new Template("Template.test", (function() {                                // 190
  var view = this;                                                                            // 191
  return HTML.DIV({                                                                           // 192
    "class": function() {                                                                     // 193
      return [ "test ", Spacebars.mustache(view.lookup("test_class")) ];                      // 194
    }                                                                                         // 195
  }, "\n    ", HTML.DIV({                                                                     // 196
    "class": "testrow"                                                                        // 197
  }, "\n      ", HTML.DIV({                                                                   // 198
    "class": "teststatus"                                                                     // 199
  }, "\n        ", Blaze.View("lookup:test_status_display", function() {                      // 200
    return Spacebars.mustache(view.lookup("test_status_display"));                            // 201
  }), "\n      "), "\n      ", HTML.DIV({                                                     // 202
    "class": "testtime"                                                                       // 203
  }, "\n        ", Blaze.View("lookup:test_time_display", function() {                        // 204
    return Spacebars.mustache(view.lookup("test_time_display"));                              // 205
  }), "\n      "), "\n      ", HTML.DIV({                                                     // 206
    "class": "testname"                                                                       // 207
  }, "\n        ", Blaze.If(function() {                                                      // 208
    return Spacebars.call(view.lookup("server"));                                             // 209
  }, function() {                                                                             // 210
    return "S:";                                                                              // 211
  }, function() {                                                                             // 212
    return "C:";                                                                              // 213
  }), "\n        ", Blaze.View("lookup:name", function() {                                    // 214
    return Spacebars.mustache(view.lookup("name"));                                           // 215
  }), "\n      "), "\n    "), "\n    ", Blaze.If(function() {                                 // 216
    return Spacebars.call(view.lookup("expanded"));                                           // 217
  }, function() {                                                                             // 218
    return [ "\n      ", Blaze.Each(function() {                                              // 219
      return Spacebars.call(view.lookup("eventsArray"));                                      // 220
    }, function() {                                                                           // 221
      return [ "\n        ", Spacebars.include(view.lookupTemplate("event")), "\n      " ];   // 222
    }, function() {                                                                           // 223
      return [ "\n        ", HTML.DIV({                                                       // 224
        "class": "event"                                                                      // 225
      }, HTML.DIV({                                                                           // 226
        "class": "nodata"                                                                     // 227
      }, "(no data)")), "\n      " ];                                                         // 228
    }), "\n    " ];                                                                           // 229
  }), "\n  ");                                                                                // 230
}));                                                                                          // 231
                                                                                              // 232
Template.__checkName("event");                                                                // 233
Template["event"] = new Template("Template.event", (function() {                              // 234
  var view = this;                                                                            // 235
  return HTML.DIV({                                                                           // 236
    "class": "event"                                                                          // 237
  }, "\n    ", HTML.DIV({                                                                     // 238
    "class": function() {                                                                     // 239
      return Spacebars.mustache(view.lookup("type"));                                         // 240
    }                                                                                         // 241
  }, "\n      ", HTML.SPAN("\n      - ", Blaze.View("lookup:type", function() {               // 242
    return Spacebars.mustache(view.lookup("type"));                                           // 243
  }), "\n      ", Blaze.If(function() {                                                       // 244
    return Spacebars.call(view.lookup("times"));                                              // 245
  }, function() {                                                                             // 246
    return [ "\n        ", HTML.SPAN({                                                        // 247
      "class": "xtimes"                                                                       // 248
    }, "(", Blaze.View("lookup:times", function() {                                           // 249
      return Spacebars.mustache(view.lookup("times"));                                        // 250
    }), " times)"), "\n      " ];                                                             // 251
  }), "\n      ", Spacebars.With(function() {                                                 // 252
    return Spacebars.call(view.lookup("get_details"));                                        // 253
  }, function() {                                                                             // 254
    return [ "\n        ", Blaze.If(function() {                                              // 255
      return Spacebars.call(view.lookup("."));                                                // 256
    }, function() {                                                                           // 257
      return [ "\n          \n          ", Blaze.If(function() {                              // 258
        return Spacebars.call(view.lookup("type"));                                           // 259
      }, function() {                                                                         // 260
        return [ HTML.CharRef({                                                               // 261
          html: "&mdash;",                                                                    // 262
          str: "—"                                                                            // 263
        }), " ", Blaze.View("lookup:type", function() {                                       // 264
          return Spacebars.mustache(view.lookup("type"));                                     // 265
        }) ];                                                                                 // 266
      }), "\n          ", Blaze.Each(function() {                                             // 267
        return Spacebars.call(view.lookup("details"));                                        // 268
      }, function() {                                                                         // 269
        return [ "\n            - ", HTML.SPAN({                                              // 270
          "class": "failkey"                                                                  // 271
        }, Blaze.View("lookup:key", function() {                                              // 272
          return Spacebars.mustache(view.lookup("key"));                                      // 273
        })), " ", Blaze.View("lookup:val", function() {                                       // 274
          return Spacebars.mustache(view.lookup("val"));                                      // 275
        }), "\n          " ];                                                                 // 276
      }), "\n        " ];                                                                     // 277
    }), "\n        ", Blaze.If(function() {                                                   // 278
      return Spacebars.call(view.lookup("stack"));                                            // 279
    }, function() {                                                                           // 280
      return HTML.PRE(Blaze.View("lookup:stack", function() {                                 // 281
        return Spacebars.mustache(view.lookup("stack"));                                      // 282
      }));                                                                                    // 283
    }), "\n      " ];                                                                         // 284
  }), "\n      ", Blaze.If(function() {                                                       // 285
    return Spacebars.call(view.lookup("is_debuggable"));                                      // 286
  }, function() {                                                                             // 287
    return [ "\n        ", HTML.SPAN({                                                        // 288
      "class": "debug"                                                                        // 289
    }, "[Debug]"), "\n      " ];                                                              // 290
  }), "\n      "), "\n    "), "\n  ");                                                        // 291
}));                                                                                          // 292
                                                                                              // 293
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);






(function () {

////////////////////////////////////////////////////////////////////////////////////////////////
//                                                                                            //
// packages/test-in-browser/driver.js                                                         //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////
                                                                                              //
////                                                                                          // 1
//// Setup                                                                                    // 2
////                                                                                          // 3
                                                                                              // 4
                                                                                              // 5
// dependency for the count of tests running/passed/failed, etc. drives                       // 6
// the navbar and the like.                                                                   // 7
var countDep = new Tracker.Dependency;                                                        // 8
// things that change on countDep                                                             // 9
var running = true;                                                                           // 10
var totalCount = 0;                                                                           // 11
var passedCount = 0;                                                                          // 12
var failedCount = 0;                                                                          // 13
var failedTests = [];                                                                         // 14
                                                                                              // 15
// Dependency for when a new top level group is added. Each group and                         // 16
// each test have their own dependency objects.                                               // 17
var topLevelGroupsDep = new Tracker.Dependency;                                               // 18
                                                                                              // 19
// An array of top-level groups.                                                              // 20
//                                                                                            // 21
// Each group is an object with:                                                              // 22
// - name: string                                                                             // 23
// - path: array of strings (names of parent groups)                                          // 24
// - parent: parent group object (back reference)                                             // 25
// - dep: Tracker.Dependency object for this group. fires when new tests added.               // 26
// - groups: list of sub-groups                                                               // 27
// - tests: list of tests in this group                                                       // 28
//                                                                                            // 29
// Each test is an object with:                                                               // 30
// - name: string                                                                             // 31
// - parent: parent group object (back reference)                                             // 32
// - server: boolean                                                                          // 33
// - fullName: string                                                                         // 34
// - dep: Tracker.Dependency object for this test. fires when the test completes.             // 35
var resultTree = [];                                                                          // 36
                                                                                              // 37
                                                                                              // 38
Session.setDefault("groupPath", ["tinytest"]);                                                // 39
Session.set("rerunScheduled", false);                                                         // 40
                                                                                              // 41
Meteor.startup(function () {                                                                  // 42
  Tracker.flush();                                                                            // 43
  Tinytest._runTestsEverywhere(reportResults, function () {                                   // 44
    running = false;                                                                          // 45
    Meteor.onTestsComplete && Meteor.onTestsComplete();                                       // 46
    countDep.changed();                                                                       // 47
    Tracker.flush();                                                                          // 48
                                                                                              // 49
    Meteor.connection._unsubscribeAll();                                                      // 50
  }, Session.get("groupPath"));                                                               // 51
                                                                                              // 52
});                                                                                           // 53
                                                                                              // 54
                                                                                              // 55
////                                                                                          // 56
//// Take incoming results and drive resultsTree                                              // 57
////                                                                                          // 58
                                                                                              // 59
// report a series of events in a single test, or just the existence of                       // 60
// that test if no events. this is the entry point for test results to                        // 61
// this module.                                                                               // 62
var reportResults = function(results) {                                                       // 63
  var test = _findTestForResults(results);                                                    // 64
                                                                                              // 65
  // Tolerate repeated reports: first undo the effect of any previous report                  // 66
  var status = _testStatus(test);                                                             // 67
  if (status === "failed") {                                                                  // 68
    failedCount--;                                                                            // 69
    countDep.changed();                                                                       // 70
  } else if (status === "succeeded") {                                                        // 71
    passedCount--;                                                                            // 72
    countDep.changed();                                                                       // 73
  }                                                                                           // 74
                                                                                              // 75
  // Now process the current report                                                           // 76
  if (_.isArray(results.events)) {                                                            // 77
    // append events, if present                                                              // 78
    Array.prototype.push.apply((test.events || (test.events = [])),                           // 79
                               results.events);                                               // 80
    // sort and de-duplicate, based on sequence number                                        // 81
    test.events.sort(function (a, b) {                                                        // 82
      return a.sequence - b.sequence;                                                         // 83
    });                                                                                       // 84
    var out = [];                                                                             // 85
    _.each(test.events, function (e) {                                                        // 86
      if (out.length === 0 || out[out.length - 1].sequence !== e.sequence)                    // 87
        out.push(e);                                                                          // 88
    });                                                                                       // 89
    test.events = out;                                                                        // 90
  }                                                                                           // 91
  status = _testStatus(test);                                                                 // 92
  if (status === "failed") {                                                                  // 93
    failedCount++;                                                                            // 94
    // Expand a failed test (but only set this if the user hasn't clicked on the              // 95
    // test name yet).                                                                        // 96
    if (test.expanded === undefined)                                                          // 97
      test.expanded = true;                                                                   // 98
    if (!_.contains(failedTests, test.fullName))                                              // 99
      failedTests.push(test.fullName);                                                        // 100
                                                                                              // 101
    countDep.changed();                                                                       // 102
    test.dep.changed();                                                                       // 103
  } else if (status === "succeeded") {                                                        // 104
    passedCount++;                                                                            // 105
    countDep.changed();                                                                       // 106
    test.dep.changed();                                                                       // 107
  } else if (test.expanded) {                                                                 // 108
    // re-render the test if new results come in and the test is                              // 109
    // currently expanded.                                                                    // 110
    test.dep.changed();                                                                       // 111
  }                                                                                           // 112
};                                                                                            // 113
                                                                                              // 114
// forget all of the events for a particular test                                             // 115
var forgetEvents = function (results) {                                                       // 116
  var test = _findTestForResults(results);                                                    // 117
  var status = _testStatus(test);                                                             // 118
  if (status === "failed") {                                                                  // 119
    failedCount--;                                                                            // 120
    countDep.changed();                                                                       // 121
  } else if (status === "succeeded") {                                                        // 122
    passedCount--;                                                                            // 123
    countDep.changed();                                                                       // 124
  }                                                                                           // 125
  delete test.events;                                                                         // 126
  test.dep.changed();                                                                         // 127
};                                                                                            // 128
                                                                                              // 129
// given a 'results' as delivered via reportResults, find the                                 // 130
// corresponding leaf object in resultTree, creating one if it doesn't                        // 131
// exist. it will be an object with attributes 'name', 'parent', and                          // 132
// possibly 'events'.                                                                         // 133
var _findTestForResults = function (results) {                                                // 134
  var groupPath = results.groupPath; // array                                                 // 135
  if ((! _.isArray(groupPath)) || (groupPath.length < 1)) {                                   // 136
    throw new Error("Test must be part of a group");                                          // 137
  }                                                                                           // 138
                                                                                              // 139
  var group;                                                                                  // 140
  var i = 0;                                                                                  // 141
  _.each(groupPath, function(gname) {                                                         // 142
    var array = (group ? (group.groups || (group.groups = []))                                // 143
                 : resultTree);                                                               // 144
    var newGroup = _.find(array, function(g) { return g.name === gname; });                   // 145
    if (! newGroup) {                                                                         // 146
      newGroup = {                                                                            // 147
        name: gname,                                                                          // 148
        parent: (group || null),                                                              // 149
        path: groupPath.slice(0, i+1),                                                        // 150
        dep: new Tracker.Dependency                                                           // 151
      }; // create group                                                                      // 152
      array.push(newGroup);                                                                   // 153
                                                                                              // 154
      if (group)                                                                              // 155
        group.dep.changed();                                                                  // 156
      else                                                                                    // 157
        topLevelGroupsDep.changed();                                                          // 158
    }                                                                                         // 159
    group = newGroup;                                                                         // 160
    i++;                                                                                      // 161
  });                                                                                         // 162
                                                                                              // 163
  var testName = results.test;                                                                // 164
  var server = !!results.server;                                                              // 165
  var test = _.find(group.tests || (group.tests = []),                                        // 166
                    function(t) { return t.name === testName &&                               // 167
                                  t.server === server; });                                    // 168
  if (! test) {                                                                               // 169
    // create test                                                                            // 170
    var nameParts = _.clone(groupPath);                                                       // 171
    nameParts.push(testName);                                                                 // 172
    var fullName = nameParts.join(' - ');                                                     // 173
    test = {                                                                                  // 174
      name: testName,                                                                         // 175
      parent: group,                                                                          // 176
      server: server,                                                                         // 177
      fullName: fullName,                                                                     // 178
      dep: new Tracker.Dependency                                                             // 179
    };                                                                                        // 180
    group.tests.push(test);                                                                   // 181
    group.dep.changed();                                                                      // 182
    totalCount++;                                                                             // 183
    countDep.changed();                                                                       // 184
  }                                                                                           // 185
                                                                                              // 186
  return test;                                                                                // 187
};                                                                                            // 188
                                                                                              // 189
                                                                                              // 190
                                                                                              // 191
////                                                                                          // 192
//// Helpers on test objects                                                                  // 193
////                                                                                          // 194
                                                                                              // 195
var _testTime = function(t) {                                                                 // 196
  if (t.events && t.events.length > 0) {                                                      // 197
    var lastEvent = _.last(t.events);                                                         // 198
    if (lastEvent.type === "finish") {                                                        // 199
      if ((typeof lastEvent.timeMs) === "number") {                                           // 200
        return lastEvent.timeMs;                                                              // 201
      }                                                                                       // 202
    }                                                                                         // 203
  }                                                                                           // 204
  return null;                                                                                // 205
};                                                                                            // 206
                                                                                              // 207
var _testStatus = function(t) {                                                               // 208
  var events = t.events || [];                                                                // 209
  if (_.find(events, function(x) { return x.type === "exception"; })) {                       // 210
    // "exception" should be last event, except race conditions on the                        // 211
    // server can make this not the case.  Technically we can't tell                          // 212
    // if the test is still running at this point, but it can only                            // 213
    // result in FAIL.                                                                        // 214
    return "failed";                                                                          // 215
  } else if (events.length == 0 || (_.last(events).type != "finish")) {                       // 216
    return "running";                                                                         // 217
  } else if (_.any(events, function(e) {                                                      // 218
    return e.type == "fail" || e.type == "exception"; })) {                                   // 219
    return "failed";                                                                          // 220
  } else {                                                                                    // 221
    return "succeeded";                                                                       // 222
  }                                                                                           // 223
};                                                                                            // 224
                                                                                              // 225
                                                                                              // 226
                                                                                              // 227
////                                                                                          // 228
//// Templates                                                                                // 229
////                                                                                          // 230
                                                                                              // 231
//// Template - navBars                                                                       // 232
                                                                                              // 233
Template.navBars.helpers({                                                                    // 234
  running: function() {                                                                       // 235
    countDep.depend();                                                                        // 236
    return running;                                                                           // 237
  },                                                                                          // 238
  passed: function() {                                                                        // 239
    countDep.depend();                                                                        // 240
    return failedCount === 0;                                                                 // 241
  },                                                                                          // 242
  total_test_time: function() {                                                               // 243
    countDep.depend();                                                                        // 244
                                                                                              // 245
    // walk whole tree to get all tests                                                       // 246
    var walk = function (groups) {                                                            // 247
      var total = 0;                                                                          // 248
                                                                                              // 249
      _.each(groups || [], function (group) {                                                 // 250
        _.each(group.tests || [], function (t) {                                              // 251
          total += _testTime(t);                                                              // 252
        });                                                                                   // 253
                                                                                              // 254
        total += walk(group.groups);                                                          // 255
      });                                                                                     // 256
                                                                                              // 257
      return total;                                                                           // 258
    };                                                                                        // 259
                                                                                              // 260
    return walk(resultTree);                                                                  // 261
  }                                                                                           // 262
});                                                                                           // 263
                                                                                              // 264
                                                                                              // 265
//// Template - progressBar                                                                   // 266
                                                                                              // 267
Template.progressBar.helpers({                                                                // 268
  running: function () {                                                                      // 269
    countDep.depend();                                                                        // 270
    return running;                                                                           // 271
  },                                                                                          // 272
  percentPass: function () {                                                                  // 273
    countDep.depend();                                                                        // 274
    if (totalCount === 0)                                                                     // 275
      return 0;                                                                               // 276
    return 100*passedCount/totalCount;                                                        // 277
  },                                                                                          // 278
  totalCount: function () {                                                                   // 279
    countDep.depend();                                                                        // 280
    return totalCount;                                                                        // 281
  },                                                                                          // 282
  passedCount: function () {                                                                  // 283
    countDep.depend();                                                                        // 284
    return passedCount;                                                                       // 285
  },                                                                                          // 286
  percentFail: function () {                                                                  // 287
    countDep.depend();                                                                        // 288
    if (totalCount === 0)                                                                     // 289
      return 0;                                                                               // 290
    return 100*failedCount/totalCount;                                                        // 291
  },                                                                                          // 292
  anyFail: function () {                                                                      // 293
    countDep.depend();                                                                        // 294
    return failedCount > 0;                                                                   // 295
  },                                                                                          // 296
  barOuterClass: function () {                                                                // 297
    countDep.depend();                                                                        // 298
    return running ? 'progress-striped' : '';                                                 // 299
  },                                                                                          // 300
  barInnerClass: function () {                                                                // 301
    countDep.depend();                                                                        // 302
    return (failedCount > 0 ?                                                                 // 303
            'bar-warning' : 'bar-success');                                                   // 304
  }                                                                                           // 305
});                                                                                           // 306
                                                                                              // 307
//// Template - groupNav                                                                      // 308
                                                                                              // 309
var changeToPath = function (path) {                                                          // 310
  Session.set("groupPath", path);                                                             // 311
  Session.set("rerunScheduled", true);                                                        // 312
  // pretend there's just been a hot code push                                                // 313
  // so we run the tests completely fresh.                                                    // 314
  Reload._reload();                                                                           // 315
};                                                                                            // 316
                                                                                              // 317
Template.groupNav.helpers({                                                                   // 318
  groupPaths: function () {                                                                   // 319
    var groupPath = Session.get("groupPath");                                                 // 320
    var ret = [];                                                                             // 321
    for (var i = 1; i <= groupPath.length; i++) {                                             // 322
      ret.push({path: groupPath.slice(0,i), name: groupPath[i-1]});                           // 323
    }                                                                                         // 324
    return ret;                                                                               // 325
  },                                                                                          // 326
  rerunScheduled: function () {                                                               // 327
    return Session.get("rerunScheduled");                                                     // 328
  }                                                                                           // 329
});                                                                                           // 330
                                                                                              // 331
Template.groupNav.events({                                                                    // 332
  'click .group': function () {                                                               // 333
    changeToPath(this.path);                                                                  // 334
  },                                                                                          // 335
  'click .rerun': function () {                                                               // 336
    Session.set("rerunScheduled", true);                                                      // 337
    Reload._reload();                                                                         // 338
  }                                                                                           // 339
});                                                                                           // 340
                                                                                              // 341
Template.groupNav.onRendered(function () {                                                    // 342
  Tinytest._onCurrentClientTest = function (name) {                                           // 343
    name = (name ? 'C: '+name : '');                                                          // 344
    // Set the DOM directly so that it's immediate and we                                     // 345
    // don't wait for Tracker to flush.                                                       // 346
    var span = document.getElementById('current-client-test');                                // 347
    if (span) {                                                                               // 348
      span.innerHTML = '';                                                                    // 349
      span.appendChild(document.createTextNode(name));                                        // 350
    }                                                                                         // 351
  };                                                                                          // 352
});                                                                                           // 353
                                                                                              // 354
                                                                                              // 355
//// Template - failedTests                                                                   // 356
                                                                                              // 357
Template.failedTests.helpers({                                                                // 358
  failedTests: function() {                                                                   // 359
    countDep.depend();                                                                        // 360
    return failedTests;                                                                       // 361
  }                                                                                           // 362
});                                                                                           // 363
                                                                                              // 364
//// Template - testTable                                                                     // 365
                                                                                              // 366
Template.testTable.helpers({                                                                  // 367
  testdata: function () {                                                                     // 368
    topLevelGroupsDep.depend();                                                               // 369
    return resultTree;                                                                        // 370
  },                                                                                          // 371
  thisWithDep: function () {                                                                  // 372
    this.dep.depend();                                                                        // 373
    return this;                                                                              // 374
  }                                                                                           // 375
});                                                                                           // 376
                                                                                              // 377
//// Template - test_group                                                                    // 378
                                                                                              // 379
Template.test_group.helpers({                                                                 // 380
  thisWithDep: function () {                                                                  // 381
    this.dep.depend();                                                                        // 382
    return this;                                                                              // 383
  }                                                                                           // 384
});                                                                                           // 385
                                                                                              // 386
Template.test_group.events({                                                                  // 387
  'click .groupname': function (evt) {                                                        // 388
    changeToPath(this.path);                                                                  // 389
    // prevent enclosing groups from also triggering on                                       // 390
    // same groupname.  It would be cleaner to think of                                       // 391
    // this as each group only listening to its *own*                                         // 392
    // groupname, but currently it listens to all of them.                                    // 393
    evt.stopImmediatePropagation();                                                           // 394
  }                                                                                           // 395
});                                                                                           // 396
                                                                                              // 397
                                                                                              // 398
//// Template - test                                                                          // 399
                                                                                              // 400
Template.test.helpers({                                                                       // 401
  test_status_display: function() {                                                           // 402
    var status = _testStatus(this);                                                           // 403
    if (status == "failed") {                                                                 // 404
      return "FAIL";                                                                          // 405
    } else if (status == "succeeded") {                                                       // 406
      return "PASS";                                                                          // 407
    } else {                                                                                  // 408
      return "waiting...";                                                                    // 409
    }                                                                                         // 410
  },                                                                                          // 411
                                                                                              // 412
  test_time_display: function() {                                                             // 413
    var time = _testTime(this);                                                               // 414
    return (typeof time === "number") ? time + " ms" : "";                                    // 415
  },                                                                                          // 416
                                                                                              // 417
  test_class: function() {                                                                    // 418
    var events = this.events || [];                                                           // 419
    var classes = [_testStatus(this)];                                                        // 420
                                                                                              // 421
    if (this.expanded) {                                                                      // 422
      classes.push("expanded");                                                               // 423
    } else {                                                                                  // 424
      classes.push("collapsed");                                                              // 425
    }                                                                                         // 426
                                                                                              // 427
    return classes.join(' ');                                                                 // 428
  },                                                                                          // 429
                                                                                              // 430
  eventsArray: function() {                                                                   // 431
    var events = _.filter(this.events, function(e) {                                          // 432
      return e.type != "finish";                                                              // 433
    });                                                                                       // 434
                                                                                              // 435
    var partitionBy = function(seq, func) {                                                   // 436
      var result = [];                                                                        // 437
      var lastValue = {};                                                                     // 438
      _.each(seq, function(x) {                                                               // 439
        var newValue = func(x);                                                               // 440
        if (newValue === lastValue) {                                                         // 441
          result[result.length-1].push(x);                                                    // 442
        } else {                                                                              // 443
          lastValue = newValue;                                                               // 444
          result.push([x]);                                                                   // 445
        }                                                                                     // 446
      });                                                                                     // 447
      return result;                                                                          // 448
    };                                                                                        // 449
                                                                                              // 450
    var dupLists = partitionBy(                                                               // 451
      _.map(events, function(e) {                                                             // 452
        // XXX XXX We need something better than stringify!                                   // 453
        // stringify([undefined]) === "[null]"                                                // 454
        e = _.clone(e);                                                                       // 455
        delete e.sequence;                                                                    // 456
        return {obj: e, str: JSON.stringify(e)};                                              // 457
      }), function(x) { return x.str; });                                                     // 458
                                                                                              // 459
    return _.map(dupLists, function(L) {                                                      // 460
      var obj = L[0].obj;                                                                     // 461
      return (L.length > 1) ? _.extend({times: L.length}, obj) : obj;                         // 462
    });                                                                                       // 463
  }                                                                                           // 464
});                                                                                           // 465
                                                                                              // 466
Template.test.events({                                                                        // 467
  'click .testname': function () {                                                            // 468
    this.expanded = ! this.expanded;                                                          // 469
    this.dep.changed();                                                                       // 470
  }                                                                                           // 471
});                                                                                           // 472
                                                                                              // 473
                                                                                              // 474
//// Template - event                                                                         // 475
                                                                                              // 476
Template.event.events({                                                                       // 477
  'click .debug': function () {                                                               // 478
    // the way we manage groupPath, shortName, cookies, etc, is really                        // 479
    // messy. needs to be aggressively refactored.                                            // 480
    forgetEvents({groupPath: this.cookie.groupPath,                                           // 481
                  test: this.cookie.shortName});                                              // 482
    Tinytest._debugTest(this.cookie, reportResults);                                          // 483
  }                                                                                           // 484
});                                                                                           // 485
                                                                                              // 486
// e.g. doDiff('abc', 'bcd') => [[-1, 'a'], [0, 'bc'], [1, 'd']]                              // 487
var doDiff = function (str1, str2) {                                                          // 488
  var D = new diff_match_patch();                                                             // 489
  var pieces = D.diff_main(str1, str2, false);                                                // 490
  D.diff_cleanupSemantic(pieces);                                                             // 491
  return pieces;                                                                              // 492
};                                                                                            // 493
                                                                                              // 494
Template.event.helpers({                                                                      // 495
  get_details: function() {                                                                   // 496
                                                                                              // 497
    var details = this.details;                                                               // 498
                                                                                              // 499
    if (! details) {                                                                          // 500
      return null;                                                                            // 501
    } else {                                                                                  // 502
                                                                                              // 503
      var type = details.type;                                                                // 504
      var stack = details.stack;                                                              // 505
                                                                                              // 506
      details = _.clone(details);                                                             // 507
      delete details.type;                                                                    // 508
      delete details.stack;                                                                   // 509
                                                                                              // 510
      var prepare = function(details) {                                                       // 511
        if (type === 'string_equal') {                                                        // 512
          var diff = doDiff(details.actual,                                                   // 513
                            details.expected);                                                // 514
        }                                                                                     // 515
                                                                                              // 516
        return _.compact(_.map(details, function(val, key) {                                  // 517
                                                                                              // 518
          // make test._stringEqual results print nicely,                                     // 519
          // in particular for multiline strings                                              // 520
          if (type === 'string_equal' &&                                                      // 521
              (key === 'actual' || key === 'expected')) {                                     // 522
            var html = '<pre class="string_equal string_equal_'+key+'">';                     // 523
            _.each(diff, function (piece) {                                                   // 524
              var which = piece[0];                                                           // 525
              var text = piece[1];                                                            // 526
              if (which === 0 ||                                                              // 527
                  which === (key === 'actual' ? -1 : 1)) {                                    // 528
                var htmlBit = Blaze._escape(text).replace(                                    // 529
                    /\n/g, '<br>');                                                           // 530
                if (which !== 0)                                                              // 531
                  htmlBit = '<ins>' + htmlBit + '</ins>';                                     // 532
                html += htmlBit;                                                              // 533
              }                                                                               // 534
            });                                                                               // 535
            html += '</pre>';                                                                 // 536
            val = new Spacebars.SafeString(html);                                             // 537
          }                                                                                   // 538
                                                                                              // 539
          // You can end up with a an undefined value, e.g. using                             // 540
          // isNull without providing a message attribute: isNull(1).                         // 541
          // No need to display those.                                                        // 542
          if (!_.isUndefined(val)) {                                                          // 543
            return {                                                                          // 544
              key: key,                                                                       // 545
              val: val                                                                        // 546
            };                                                                                // 547
          } else {                                                                            // 548
            return undefined;                                                                 // 549
          }                                                                                   // 550
        }));                                                                                  // 551
      };                                                                                      // 552
                                                                                              // 553
      return {                                                                                // 554
        type: type,                                                                           // 555
        stack: stack,                                                                         // 556
        details: prepare(details)                                                             // 557
      };                                                                                      // 558
    }                                                                                         // 559
  },                                                                                          // 560
                                                                                              // 561
  is_debuggable: function() {                                                                 // 562
    return !!this.cookie;                                                                     // 563
  }                                                                                           // 564
});                                                                                           // 565
                                                                                              // 566
////////////////////////////////////////////////////////////////////////////////////////////////

}).call(this);
