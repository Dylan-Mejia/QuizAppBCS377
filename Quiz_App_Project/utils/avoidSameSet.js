function isSameSet(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}

async function sampleNonRepeatingSet(sampleFn, n, lastSetIds) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const qs = sampleFn(n);
    const ids = qs.map(q => q.id);
    if (!isSameSet(ids, lastSetIds)) return qs;
  }
  // Fallback: accept set with at least 2 differences
  const qs = sampleFn(n);
  return qs;
}

module.exports = { sampleNonRepeatingSet };
