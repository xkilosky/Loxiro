// Presentation hint only; it grants no native privileges and exposes no JS bridge.
export function isAndroidBrowser(userAgent: string = navigator.userAgent) {
  return /(?:^|\s)LoxiroAndroid\/\d+(?:\.\d+)*(?:\s|$)/.test(userAgent);
}
