export const esEmail = (v) => {
  if (typeof v !== 'string' || v.length > 254) return false;
  const at = v.indexOf('@');
  if (at <= 0 || at !== v.lastIndexOf('@')) return false;

  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) {
    return false;
  }

  const labels = domain.split('.');
  return labels.length >= 2
    && labels.every((label) => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))
    && /^[A-Za-z]{2,63}$/.test(labels.at(-1));
};
