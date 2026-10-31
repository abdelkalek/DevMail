package dev.devmail.model;

/**
 * @param contentId the Content-ID without angle brackets, or null; inline images are referenced from HTML as cid:...
 * @param inline    true for parts embedded in the body (hidden from the attachment list)
 */
public record StoredAttachment(
        String id,
        String fileName,
        String contentType,
        String contentId,
        boolean inline,
        byte[] data) {
}
