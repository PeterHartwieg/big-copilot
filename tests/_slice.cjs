// Source slices for the tests that run a piece of ba_dashboard.py or
// web/app.js in a VM. A bare indexOf() that misses returns -1, and the slice
// then quietly takes the wrong span; these throw instead, naming the anchor.
// Not a test file itself: the leading underscore keeps it out of the
// tests/*.test.cjs glob.
'use strict';

const show = s => JSON.stringify(s.length > 70 ? s.slice(0, 67) + '...' : s);

function count(src, anchor){
  let n = 0;
  for (let i = src.indexOf(anchor); i >= 0; i = src.indexOf(anchor, i + 1)) n++;
  return n;
}

/* Where `anchor` starts, searched from `from`. With once (the default) the
   anchor must be in the whole source exactly once, so a copy of it elsewhere
   cannot move the slice without a word. */
function at(src, anchor, {from = 0, once = true} = {}){
  const i = src.indexOf(anchor, from);
  if (i < 0) throw new Error(`slice anchor not found: ${show(anchor)}` + (from ? ` (after offset ${from})` : ''));
  if (once) {
    const n = count(src, anchor);
    if (n !== 1) throw new Error(`slice anchor ${show(anchor)} is in the source ${n} times, expected once`);
  }
  return i;
}

/* The text from `a` up to (not including) `b`. `a` is found exactly once
   unless once is false. `b` is its first occurrence after `a`, or with
   endAfter its first occurrence after that anchor (itself found once, after
   `a`), or with last its last occurrence in the source, which must lie
   after `a`. */
function between(src, a, b, {once = true, from = 0, endAfter = null, last = false} = {}){
  const start = at(src, a, {from, once});
  let searchFrom = start + a.length;
  if (endAfter !== null) {
    const mid = at(src, endAfter, {from: searchFrom});
    searchFrom = mid + endAfter.length;
  }
  const end = last ? src.lastIndexOf(b) : src.indexOf(b, searchFrom);
  if (end < searchFrom)
    throw new Error(`slice end anchor not found after ${show(endAfter ?? a)}: ${show(b)}`);
  return src.slice(start, end);
}

module.exports = {at, between, count};
