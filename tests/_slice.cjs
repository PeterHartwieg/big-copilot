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
   unless once is false; `b` is its first occurrence after `a`, and with
   ordered (the default) it must not also occur before `a`, which is what a
   plain src.slice(src.indexOf(a), src.indexOf(b)) relied on. */
function between(src, a, b, {once = true, ordered = true, from = 0} = {}){
  const start = at(src, a, {from, once});
  const end = src.indexOf(b, start + a.length);
  if (end < 0) throw new Error(`slice end anchor not found after ${show(a)}: ${show(b)}`);
  if (ordered) {
    const first = src.indexOf(b, from);
    if (first < start) throw new Error(`slice end anchor ${show(b)} comes before its start anchor ${show(a)}`);
  }
  return src.slice(start, end);
}

module.exports = {at, between, count};
