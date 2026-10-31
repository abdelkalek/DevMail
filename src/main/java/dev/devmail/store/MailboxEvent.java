package dev.devmail.store;

import dev.devmail.model.StoredMessage;

/** Published whenever the mailbox changes; {@code message} is null for {@link Type#CLEARED}. */
public record MailboxEvent(Type type, StoredMessage message) {

    public enum Type {
        ADDED("message-added"),
        UPDATED("message-updated"),
        DELETED("message-deleted"),
        CLEARED("cleared");

        private final String eventName;

        Type(String eventName) {
            this.eventName = eventName;
        }

        /** The SSE event name the frontend listens for. */
        public String eventName() {
            return eventName;
        }
    }
}
