// What a browser will and will not let a web page do about file collisions.
//
// saveBlob() hands a blob to the browser through an <a download> and the
// browser's download manager owns the file from that moment on. It decides what
// happens when a name is already taken, and what it does is append "(1)" --
// App.pdf becomes App(1).pdf -- without telling the page. No web API can look
// into the user's Downloads folder, overwrite a file that is already there, or
// rename one that has already been saved. That is why the automatic "(1)" the
// user objects to cannot simply be turned off from here.
//
// What Veilix genuinely does know is what it has saved itself: its own download
// history. That is a real signal for the case that actually matters, because a
// daily-updating preview was downloaded by Veilix in the first place. It cannot
// catch a file fetched by another browser or copied in by hand, and nothing in
// this module pretends otherwise.

/** Splits "App.tar.gz" into base "App.tar" and ext ".gz", keeping dotfiles whole. */
export function splitName(filename: string) {
  const dot = filename.lastIndexOf('.');
  // A leading dot marks a hidden file rather than an extension, and a trailing
  // dot has no extension at all. Both must stay inside the base, or "_v2" ends
  // up glued to the wrong side of the name.
  if (dot <= 0 || dot === filename.length - 1) return {base: filename, ext: ''};
  return {base: filename.slice(0, dot), ext: filename.slice(dot)};
}

/**
 * The first name in the _v2, _v3, ... sequence that is not already taken, or the
 * name unchanged when nothing has taken it yet.
 *
 * "Keep both" cannot rename the file already on disk -- only the browser can do
 * that -- so this versions the NEW file, which is the half genuinely under our
 * control. Both files then carry names the user can tell apart, instead of one
 * of them being silently renamed to something they never chose.
 */
export function nextVersionName(filename: string, taken: Iterable<string>) {
  const used = new Set(taken);
  if (!used.has(filename)) return filename;
  const {base, ext} = splitName(filename);
  for (let n = 2; n <= 999; n++) {
    const candidate = `${base}_v${n}${ext}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_v${Date.now()}${ext}`;
}
