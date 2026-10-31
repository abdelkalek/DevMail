package dev.devmail.web;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import dev.devmail.store.MailboxEvent;

/** Pushes mailbox changes to every connected browser over Server-Sent Events. */
@Component
public class SseBroadcaster {

    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L); // never time out; we send heartbeats instead
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("hello").data("ok"));
        } catch (IOException e) {
            discard(emitter);
        }
        return emitter;
    }

    @EventListener
    public void onMailboxEvent(MailboxEvent event) {
        Object payload = event.message() == null ? Map.of() : Dtos.summary(event.message());
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name(event.type().eventName()).data(payload, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException e) {
                discard(emitter);
            }
        }
    }

    /** Keeps idle connections open through proxies and lets us notice browsers that went away. */
    @Scheduled(fixedRate = 20_000)
    public void heartbeat() {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("keep-alive"));
            } catch (IOException | IllegalStateException e) {
                discard(emitter);
            }
        }
    }

    /**
     * Unregisters a failed emitter and completes its async request cleanly. Without the
     * complete() call the container fires an async error dispatch for the broken connection
     * and Tomcat logs the aborted-write IOException as a servlet exception, even though the
     * client simply went away.
     */
    private void discard(SseEmitter emitter) {
        emitters.remove(emitter);
        try {
            emitter.complete();
        } catch (RuntimeException ignored) {
            // already completed or errored — nothing left to clean up
        }
    }
}
