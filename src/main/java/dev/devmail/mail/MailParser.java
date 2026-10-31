package dev.devmail.mail;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import dev.devmail.model.MailHeader;
import dev.devmail.model.StoredAttachment;
import dev.devmail.model.StoredMessage;
import dev.devmail.smtp.ReceivedMail;
import jakarta.mail.Header;
import jakarta.mail.MessagingException;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.ContentType;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.internet.MimePart;
import jakarta.mail.internet.MimeUtility;

/** Turns raw RFC 5322 / MIME bytes into a {@link StoredMessage}. Never throws: bad mail still gets stored. */
@Component
public class MailParser {

    private static final Logger log = LoggerFactory.getLogger(MailParser.class);
    private static final Pattern ANGLE_ADDRESS = Pattern.compile("<([^>]+)>");
    private static final int PREVIEW_LENGTH = 140;

    private final Session session = Session.getInstance(lenientProperties());

    private static Properties lenientProperties() {
        Properties props = new Properties();
        // Real-world mail is messy; accept it rather than rejecting it.
        props.setProperty("mail.mime.address.strict", "false");
        props.setProperty("mail.mime.decodetext.strict", "false");
        props.setProperty("mail.mime.ignoreunknownencoding", "true");
        return props;
    }

    public StoredMessage parse(ReceivedMail mail) {
        String id = UUID.randomUUID().toString();
        try {
            return doParse(id, mail);
        } catch (Exception e) {
            log.warn("Could not parse message, storing it as raw text: {}", e.toString());
            return fallback(id, mail);
        }
    }

    private StoredMessage doParse(String id, ReceivedMail mail) throws MessagingException, IOException {
        MimeMessage mime = new MimeMessage(session, new ByteArrayInputStream(mail.data()));

        List<String> fromHeader = addresses(mime, "From");
        List<String> to = addresses(mime, "To");
        List<String> cc = addresses(mime, "Cc");

        // Recipients that only appear in the SMTP envelope were BCC'd.
        Set<String> visible = new HashSet<>();
        to.forEach(a -> visible.add(bare(a)));
        cc.forEach(a -> visible.add(bare(a)));
        List<String> bcc = mail.envelopeRecipients().stream().filter(r -> !visible.contains(bare(r))).toList();

        String from = fromHeader.isEmpty()
                ? (mail.envelopeFrom().isBlank() ? "(unknown sender)" : mail.envelopeFrom())
                : String.join(", ", fromHeader);

        String subject = header(mime, "Subject");
        Instant sentAt = null;
        try {
            if (mime.getSentDate() != null) {
                sentAt = mime.getSentDate().toInstant();
            }
        } catch (MessagingException ignored) {
            // unparseable Date header: leave it null
        }

        Body body = new Body();
        walk(mime, body);

        List<MailHeader> headers = new ArrayList<>();
        Enumeration<?> all = mime.getAllHeaders();
        while (all.hasMoreElements()) {
            Header h = (Header) all.nextElement();
            headers.add(new MailHeader(h.getName(), decodeHeader(h.getValue())));
        }

        return new StoredMessage(
                id,
                mail.receivedAt(),
                mail.envelopeFrom(),
                mail.envelopeRecipients(),
                from,
                to,
                cc,
                bcc,
                subject == null ? "" : subject,
                preview(body.text, body.html),
                sentAt,
                body.text,
                body.html,
                List.copyOf(headers),
                List.copyOf(body.attachments),
                mail.data(),
                new AtomicBoolean(false));
    }

    /** Depth-first walk of the MIME tree, collecting the first text/html and text/plain bodies and all attachments. */
    private void walk(Part part, Body body) throws MessagingException, IOException {
        if (part.isMimeType("multipart/*")) {
            Multipart multipart = (Multipart) part.getContent();
            for (int i = 0; i < multipart.getCount(); i++) {
                walk(multipart.getBodyPart(i), body);
            }
            return;
        }

        String disposition = part.getDisposition();
        boolean explicitAttachment = Part.ATTACHMENT.equalsIgnoreCase(disposition);
        String fileName = decodeFileName(part.getFileName());
        boolean isPlain = part.isMimeType("text/plain");
        boolean isHtml = part.isMimeType("text/html");

        if (!explicitAttachment && fileName == null) {
            if (isPlain && body.text == null) {
                body.text = readText(part);
                return;
            }
            if (isHtml && body.html == null) {
                body.html = readText(part);
                return;
            }
        }

        String contentType = baseType(part);
        String contentId = null;
        if (part instanceof MimePart mimePart) {
            contentId = stripBrackets(mimePart.getContentID());
        }
        boolean inline = contentId != null && !explicitAttachment;

        byte[] data;
        try (InputStream in = part.getInputStream()) {
            data = in.readAllBytes();
        }

        if (fileName == null) {
            fileName = "attachment-" + (body.attachments.size() + 1) + extensionFor(contentType);
        }
        body.attachments.add(new StoredAttachment(
                UUID.randomUUID().toString(), fileName, contentType, contentId, inline, data));
    }

    private static String readText(Part part) throws MessagingException, IOException {
        try {
            Object content = part.getContent();
            if (content instanceof String s) {
                return s;
            }
        } catch (UnsupportedEncodingException e) {
            // unknown charset: fall through and decode leniently below
        }
        try (InputStream in = part.getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static List<String> addresses(MimeMessage mime, String headerName) throws MessagingException {
        String[] values = mime.getHeader(headerName);
        if (values == null || values.length == 0) {
            return List.of();
        }
        String joined = String.join(",", values);
        try {
            List<String> result = new ArrayList<>();
            for (InternetAddress address : InternetAddress.parseHeader(joined, false)) {
                result.add(address.toUnicodeString());
            }
            return result;
        } catch (AddressException e) {
            return List.of(decodeHeader(joined));
        }
    }

    private static String header(MimeMessage mime, String name) throws MessagingException {
        String[] values = mime.getHeader(name);
        return values == null || values.length == 0 ? null : decodeHeader(values[0]);
    }

    private static String decodeHeader(String value) {
        if (value == null) {
            return "";
        }
        try {
            return MimeUtility.decodeText(MimeUtility.unfold(value));
        } catch (UnsupportedEncodingException e) {
            return value;
        }
    }

    private static String decodeFileName(String name) {
        if (name == null || name.isBlank()) {
            return null;
        }
        try {
            return MimeUtility.decodeText(name);
        } catch (UnsupportedEncodingException e) {
            return name;
        }
    }

    private static String baseType(Part part) throws MessagingException {
        try {
            return new ContentType(part.getContentType()).getBaseType().toLowerCase(Locale.ROOT);
        } catch (MessagingException | RuntimeException e) {
            return "application/octet-stream";
        }
    }

    private static String stripBrackets(String contentId) {
        if (contentId == null) {
            return null;
        }
        String trimmed = contentId.trim();
        if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.length() > 2) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String bare(String address) {
        Matcher m = ANGLE_ADDRESS.matcher(address);
        return (m.find() ? m.group(1) : address).trim().toLowerCase(Locale.ROOT);
    }

    private static String extensionFor(String contentType) {
        return switch (contentType) {
            case "application/pdf" -> ".pdf";
            case "image/png" -> ".png";
            case "image/jpeg" -> ".jpg";
            case "image/gif" -> ".gif";
            case "text/plain" -> ".txt";
            case "text/html" -> ".html";
            case "message/rfc822" -> ".eml";
            default -> "";
        };
    }

    private static String preview(String text, String html) {
        String source = text != null && !text.isBlank() ? text : (html == null ? "" : stripHtml(html));
        String collapsed = source.replaceAll("\\s+", " ").trim();
        return collapsed.length() > PREVIEW_LENGTH ? collapsed.substring(0, PREVIEW_LENGTH) + "…" : collapsed;
    }

    private static String stripHtml(String html) {
        return html
                .replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?s)<[^>]+>", " ")
                .replace("&nbsp;", " ")
                .replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&#39;", "'")
                .replace("&amp;", "&");
    }

    private StoredMessage fallback(String id, ReceivedMail mail) {
        String text = new String(mail.data(), StandardCharsets.UTF_8);
        return new StoredMessage(
                id,
                mail.receivedAt(),
                mail.envelopeFrom(),
                mail.envelopeRecipients(),
                mail.envelopeFrom().isBlank() ? "(unknown sender)" : mail.envelopeFrom(),
                List.of(),
                List.of(),
                mail.envelopeRecipients(),
                "(unparseable message)",
                preview(text, null),
                null,
                text,
                null,
                List.of(),
                List.of(),
                mail.data(),
                new AtomicBoolean(false));
    }

    private static final class Body {
        String text;
        String html;
        final List<StoredAttachment> attachments = new ArrayList<>();
    }
}
