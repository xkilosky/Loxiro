package app.loxiro.browser;

import java.net.URI;
import java.net.URLEncoder;
import java.util.Locale;

/** No javascript:, file:, content:, data:, intent: or credential-bearing navigation. */
final class UrlPolicy {
    static final String HOME = "https://loxiro-preview.vercel.app/?android-shell=1#home";
    /** Hosted Home/search needs the native address bar, unlike an external website. */
    static boolean isHomeSurface(String url){
        if(!isWebUrl(url))return false;
        try{URI u=new URI(url),home=new URI(HOME);return home.getScheme().equalsIgnoreCase(u.getScheme())&&home.getHost().equalsIgnoreCase(u.getHost())&&(u.getPort()==-1||u.getPort()==443)&&(u.getPath()==null||u.getPath().isEmpty()||"/".equals(u.getPath()));}catch(Exception invalid){return false;}
    }
    static boolean isWebUrl(String value) {
        if (value == null || value.length() > 4096) return false;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            return scheme != null && (scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("http"))
                && uri.getHost() != null && !uri.getHost().isEmpty() && uri.getRawUserInfo() == null
                && uri.getPort() >= -1 && uri.getPort() <= 65535;
        } catch (Exception ignored) { return false; }
    }
    static String resolve(String raw) {
        if (raw == null) return null;
        String text = raw.trim();
        if (text.isEmpty() || text.length() > 4096) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.startsWith("https:") || lower.startsWith("http:")) return isWebUrl(text) ? text : null;
        if (!text.matches(".*\\s.*") && (text.matches("^[\\w-]+(?:\\.[\\w-]+)+(?:[:/?#].*)?$") || lower.startsWith("localhost") || text.startsWith("["))) {
            String url = "https://" + text;
            return isWebUrl(url) ? url : null;
        }
        if (text.matches("^[a-zA-Z][a-zA-Z0-9+.-]*:.*")) return null;
        String q = text.substring(0, Math.min(200, text.length()));
        try { return "https://loxiro-preview.vercel.app/?android-shell=1#results?q=" + URLEncoder.encode(q, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException impossible) { return null; }
    }
    static String sharedLink(String text) {
        if(text==null||text.length()>8192)return null;
        if(isWebUrl(text.trim()))return text.trim();
        java.util.regex.Matcher links=java.util.regex.Pattern.compile("https?://[^\\s<>\"']+",java.util.regex.Pattern.CASE_INSENSITIVE).matcher(text);
        while(links.find()){
            String candidate=links.group().replaceAll("[.,;!?)]+$", "");
            if(isWebUrl(candidate))return candidate;
        }
        return null;
    }
    static String label(String url) {
        try { return new URI(url).getHost(); } catch (Exception ignored) { return "New tab"; }
    }
}
