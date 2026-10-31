package dev.devmail.store;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import dev.devmail.config.DevMailProperties;
import dev.devmail.model.StoredMessage;

/** In-memory mailbox, capped at {@code devmail.store.max-messages}. Thread-safe. */
@Component
public class MessageStore {

    private final Map<String, StoredMessage> messages = new LinkedHashMap<>(); // insertion order = arrival order
    private final int maxMessages;
    private final ApplicationEventPublisher publisher;

    public MessageStore(DevMailProperties properties, ApplicationEventPublisher publisher) {
        this.maxMessages = Math.max(1, properties.store().maxMessages());
        this.publisher = publisher;
    }

    public StoredMessage add(StoredMessage message) {
        synchronized (this) {
            messages.put(message.id(), message);
            Iterator<String> oldest = messages.keySet().iterator();
            while (messages.size() > maxMessages && oldest.hasNext()) {
                oldest.next();
                oldest.remove();
            }
        }
        publisher.publishEvent(new MailboxEvent(MailboxEvent.Type.ADDED, message));
        return message;
    }

    /** Newest first. A blank query matches everything. */
    public List<StoredMessage> findAll(String query) {
        List<StoredMessage> snapshot;
        synchronized (this) {
            snapshot = new ArrayList<>(messages.values());
        }
        Collections.reverse(snapshot);
        if (query == null || query.isBlank()) {
            return snapshot;
        }
        String needle = query.trim().toLowerCase(Locale.ROOT);
        return snapshot.stream().filter(m -> matches(m, needle)).toList();
    }

    public synchronized Optional<StoredMessage> find(String id) {
        return Optional.ofNullable(messages.get(id));
    }

    public synchronized int count() {
        return messages.size();
    }

    public synchronized int unreadCount() {
        return (int) messages.values().stream().filter(m -> !m.read().get()).count();
    }

    public int maxMessages() {
        return maxMessages;
    }

    public boolean markRead(String id) {
        Optional<StoredMessage> found = find(id);
        if (found.isEmpty()) {
            return false;
        }
        StoredMessage message = found.get();
        if (message.read().compareAndSet(false, true)) {
            publisher.publishEvent(new MailboxEvent(MailboxEvent.Type.UPDATED, message));
        }
        return true;
    }

    public boolean delete(String id) {
        StoredMessage removed;
        synchronized (this) {
            removed = messages.remove(id);
        }
        if (removed == null) {
            return false;
        }
        publisher.publishEvent(new MailboxEvent(MailboxEvent.Type.DELETED, removed));
        return true;
    }

    public void clear() {
        synchronized (this) {
            messages.clear();
        }
        publisher.publishEvent(new MailboxEvent(MailboxEvent.Type.CLEARED, null));
    }

    private static boolean matches(StoredMessage m, String needle) {
        return contains(m.subject(), needle)
                || contains(m.from(), needle)
                || m.to().stream().anyMatch(s -> contains(s, needle))
                || m.cc().stream().anyMatch(s -> contains(s, needle))
                || m.envelopeTo().stream().anyMatch(s -> contains(s, needle))
                || contains(m.textBody(), needle);
    }

    private static boolean contains(String haystack, String needle) {
        return haystack != null && haystack.toLowerCase(Locale.ROOT).contains(needle);
    }
}
