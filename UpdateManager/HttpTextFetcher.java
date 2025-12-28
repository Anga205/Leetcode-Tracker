import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class HttpTextFetcher {
    // Fetches text content from the given URL
    public static String fetchText(String urlText) throws Exception {
        URL url = new URL(urlText);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            // Set timeouts and method
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            int status = conn.getResponseCode();
            if (status != 200) {
                InputStream es = conn.getErrorStream();
                String err = null;
                if (es != null) {
                    try (BufferedReader er = new BufferedReader(new InputStreamReader(es))) {
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = er.readLine()) != null) sb.append(line);
                        err = sb.toString();
                    }
                }
                String msg = "Failed HTTP " + status + " fetching " + urlText;
                if (err != null && !err.isEmpty()) {
                    String snippet = err.length() > 500 ? err.substring(0, 500) + "..." : err;
                    msg += " — response body: " + snippet;
                }
                throw new Exception(msg);
            }

            InputStream stream = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(stream));
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                text.append(line);
            }
            reader.close();
            return text.toString();
        } catch (Exception e) {
            throw new Exception("Error fetching URL " + urlText + ": " + e.getMessage(), e);
        } finally {
            try { conn.disconnect(); } catch (Exception ignore) { }
        }
    }
}
