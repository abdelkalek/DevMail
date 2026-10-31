package dev.devmail.web;

import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import dev.devmail.model.StoredAttachment;
import dev.devmail.model.StoredMessage;
import dev.devmail.smtp.SmtpServerLifecycle;
import dev.devmail.store.MessageStore;

@RestController
@RequestMapping("/api")
public class MessageController {

    /** Image types that are safe to display inline. SVG is deliberately absent: it can carry script. */
    private static final Set<String> INLINE_SAFE_TYPES =
            Set.of("image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp");

    private static final Pattern HEAD_OPEN = Pattern.compile("(?i)<head(\\s[^>]*)?>");

    /**
     * Policy for the HTML preview: no scripts (default-src 'none'), but remote images and styles are allowed so
     * emails render the way recipients will see them.
     */
    private static final String HTML_CSP = "default-src 'none'; img-src * data: blob:; style-src * 'unsafe-inline'; "
            + "font-src * data:; media-src *; sandbox allow-popups allow-popups-to-escape-sandbox";

    private final MessageStore store;
    private final SseBroadcaster broadcaster;
    private final SmtpServerLifecycle smtp;

    public MessageController(MessageStore store, SseBroadcaster broadcaster, SmtpServerLifecycle smtp) {
        this.store = store;
        this.broadcaster = broadcaster;
        this.smtp = smtp;
    }

    @GetMapping("/server")
    public Dtos.ServerInfo server() {
        String version = getClass().getPackage().getImplementationVersion();
        return new Dtos.ServerInfo(smtp.host(), smtp.port(), store.count(), store.maxMessages(),
                version == null ? "dev" : version);
    }

    @GetMapping("/messages")
    public Dtos.MessageList list(@RequestParam(name = "q", required = false) String query) {
        var messages = store.findAll(query).stream().map(Dtos::summary).toList();
        return new Dtos.MessageList(messages, store.count(), store.unreadCount());
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<Dtos.MessageDetail> get(@PathVariable String id) {
        return store.find(id).map(m -> ResponseEntity.ok(Dtos.detail(m))).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/messages/{id}/read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        return store.markRead(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/messages/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        return store.delete(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @DeleteMapping("/messages")
    public ResponseEntity<Void> clear() {
        store.clear();
        return ResponseEntity.noContent().build();
    }

    /** The message exactly as received. With {@code download=true} it is served as an .eml file. */
    @GetMapping("/messages/{id}/raw")
    public ResponseEntity<byte[]> raw(@PathVariable String id, @RequestParam(defaultValue = "false") boolean download) {
        return store.find(id).map(m -> {
            ResponseEntity.BodyBuilder response = ResponseEntity.ok().header("X-Content-Type-Options", "nosniff");
            if (download) {
                return response
                        .contentType(MediaType.parseMediaType("message/rfc822"))
                        .header(HttpHeaders.CONTENT_DISPOSITION, attachmentDisposition(emlFileName(m)))
                        .body(m.raw());
            }
            return response.contentType(new MediaType("text", "plain", StandardCharsets.UTF_8)).body(m.raw());
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** HTML body for the preview iframe, with cid: images pointed at the attachment endpoint. */
    @GetMapping("/messages/{id}/html")
    public ResponseEntity<String> html(@PathVariable String id) {
        return store.find(id).filter(m -> m.htmlBody() != null).map(m -> {
            String html = m.htmlBody();
            for (StoredAttachment a : m.attachments()) {
                if (a.contentId() != null) {
                    html = html.replace("cid:" + a.contentId(), attachmentPath(m, a) + "?inline=true");
                }
            }
            // Open links in a new tab instead of navigating the preview frame.
            Matcher head = HEAD_OPEN.matcher(html);
            html = head.find()
                    ? html.substring(0, head.end()) + "<base target=\"_blank\">" + html.substring(head.end())
                    : "<base target=\"_blank\">" + html;
            return ResponseEntity.ok()
                    .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                    .header("Content-Security-Policy", HTML_CSP)
                    .header("X-Content-Type-Options", "nosniff")
                    .body(html);
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/messages/{id}/attachments/{attachmentId}")
    public ResponseEntity<byte[]> attachment(
            @PathVariable String id,
            @PathVariable String attachmentId,
            @RequestParam(defaultValue = "false") boolean inline) {
        return store.find(id)
                .flatMap(m -> m.attachments().stream().filter(a -> a.id().equals(attachmentId)).findFirst())
                .map(a -> {
                    boolean showInline = inline && INLINE_SAFE_TYPES.contains(a.contentType());
                    ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                            .contentType(mediaType(a.contentType()))
                            .header("X-Content-Type-Options", "nosniff")
                            // Attachments are untrusted: even if opened directly they may not run anything.
                            .header("Content-Security-Policy", "sandbox; default-src 'none'");
                    if (!showInline) {
                        response.header(HttpHeaders.CONTENT_DISPOSITION, attachmentDisposition(a.fileName()));
                    }
                    return response.body(a.data());
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events() {
        return broadcaster.subscribe();
    }

    private static String attachmentPath(StoredMessage m, StoredAttachment a) {
        return "/api/messages/" + m.id() + "/attachments/" + a.id();
    }

    private static MediaType mediaType(String contentType) {
        try {
            return MediaType.parseMediaType(contentType);
        } catch (InvalidMediaTypeException e) {
            return MediaType.APPLICATION_OCTET_STREAM;
        }
    }

    private static String attachmentDisposition(String fileName) {
        return ContentDisposition.attachment().filename(fileName, StandardCharsets.UTF_8).build().toString();
    }

    private static String emlFileName(StoredMessage m) {
        String base = m.subject() == null ? "" : m.subject().replaceAll("[^A-Za-z0-9._ -]", "_").trim();
        if (base.isEmpty()) {
            base = "message";
        }
        return (base.length() > 60 ? base.substring(0, 60) : base) + ".eml";
    }
}
