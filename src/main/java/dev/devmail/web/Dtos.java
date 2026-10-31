package dev.devmail.web;

import java.time.Instant;
import java.util.List;

import dev.devmail.model.MailHeader;
import dev.devmail.model.StoredAttachment;
import dev.devmail.model.StoredMessage;

/** JSON shapes returned by the REST API (mirrored by frontend/src/lib/types.ts). */
public final class Dtos {

    private Dtos() {
    }

    public record MessageSummary(
            String id,
            Instant receivedAt,
            String from,
            List<String> to,
            String subject,
            String preview,
            int size,
            boolean read,
            int attachmentCount,
            boolean hasHtml) {
    }

    public record AttachmentInfo(String id, String fileName, String contentType, int size, boolean inline) {
    }

    public record MessageDetail(
            String id,
            Instant receivedAt,
            String from,
            List<String> to,
            String subject,
            String preview,
            int size,
            boolean read,
            int attachmentCount,
            boolean hasHtml,
            String envelopeFrom,
            List<String> envelopeTo,
            List<String> cc,
            List<String> bcc,
            Instant sentAt,
            String textBody,
            String htmlBody,
            List<MailHeader> headers,
            List<AttachmentInfo> attachments) {
    }

    public record MessageList(List<MessageSummary> messages, int total, int unread) {
    }

    public record ServerInfo(String smtpHost, int smtpPort, int messageCount, int maxMessages, String version) {
    }

    public static MessageSummary summary(StoredMessage m) {
        return new MessageSummary(
                m.id(),
                m.receivedAt(),
                m.from(),
                recipients(m),
                m.subject(),
                m.preview(),
                m.raw().length,
                m.read().get(),
                visibleAttachments(m),
                m.htmlBody() != null);
    }

    public static MessageDetail detail(StoredMessage m) {
        return new MessageDetail(
                m.id(),
                m.receivedAt(),
                m.from(),
                recipients(m),
                m.subject(),
                m.preview(),
                m.raw().length,
                m.read().get(),
                visibleAttachments(m),
                m.htmlBody() != null,
                m.envelopeFrom(),
                m.envelopeTo(),
                m.cc(),
                m.bcc(),
                m.sentAt(),
                m.textBody(),
                m.htmlBody(),
                m.headers(),
                m.attachments().stream().map(Dtos::attachment).toList());
    }

    private static AttachmentInfo attachment(StoredAttachment a) {
        return new AttachmentInfo(a.id(), a.fileName(), a.contentType(), a.data().length, a.inline());
    }

    /** The To header, or the envelope recipients for mail that only reached us via BCC. */
    private static List<String> recipients(StoredMessage m) {
        return m.to().isEmpty() ? m.envelopeTo() : m.to();
    }

    private static int visibleAttachments(StoredMessage m) {
        return (int) m.attachments().stream().filter(a -> !a.inline()).count();
    }
}
