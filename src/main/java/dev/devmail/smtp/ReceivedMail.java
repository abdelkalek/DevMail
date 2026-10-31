package dev.devmail.smtp;

import java.time.Instant;
import java.util.List;

/** One message exactly as it came off the wire, plus its SMTP envelope. */
public record ReceivedMail(
        String envelopeFrom,
        List<String> envelopeRecipients,
        byte[] data,
        String remoteAddress,
        Instant receivedAt) {
}
