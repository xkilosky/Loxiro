// Presentation hint only; it grants no native privileges and exposes no JS bridge.
// Matches the Veilix token and the legacy Loxiro one: APKs already installed on users'
// devices still announce themselves as LoxiroAndroid and must keep working.
export function isAndroidBrowser(userAgent: string = navigator.userAgent) {
  return /(?:^|\s)(?:Veilix|Loxiro)Android\/\d+(?:\.\d+)*(?:\s|$)/.test(userAgent);
}
