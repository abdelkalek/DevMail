package dev.devmail.model;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/** A captured message: the parsed view plus the original bytes. */
public record StoredMessage(
        String id,
        Instant receivedAt,
        String envelopeFrom,
        List<String> envelopeTo,
        String from,
        List<String> to,
        List<String> cc,
        List<String> bcc,
        String subject,
        String preview,
        Instant sentAt,
        String textBody,
        String htmlBody,
        List<MailHeader> headers,
        List<StoredAttachment> attachments,
        byte[] raw,
        AtomicBoolean read) {
}
