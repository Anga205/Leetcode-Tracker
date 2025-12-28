public class LeetCodeApi {
    private final String baseUrl;

    public LeetCodeApi(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    }

    public String getUserJson(String username) throws Exception {
        String url = baseUrl + username;
        try {
            return HttpTextFetcher.fetchText(url);
        } catch (Exception e) {
            throw new Exception("Failed to fetch user JSON for '" + username + "' from " + url + ": " + e.getMessage(), e);
        }
    }

    public Integer getUserTotalSolved(String username) throws Exception {
        String json = getUserJson(username);
        return parseTotalSolved(json);
    }

    public Integer parseTotalSolved(String json) {
        if (json == null) return null;
        String marker = "\"totalSolved\"";
        int markerIndex = json.indexOf(marker);
        if (markerIndex < 0) return null;
        int colonIndex = json.indexOf(':', markerIndex + marker.length());
        if (colonIndex < 0) return null;
        int i = colonIndex + 1;
        // Skip whitespace
        while (i < json.length() && Character.isWhitespace(json.charAt(i))) i++;
        int start = i;
        // Read digits
        while (i < json.length() && Character.isDigit(json.charAt(i))) i++;
        if (start == i) return null;
        // Parse integer
        try {
            return Integer.parseInt(json.substring(start, i));
        } catch (NumberFormatException nfe) {
            return null;
        }
    }
}
