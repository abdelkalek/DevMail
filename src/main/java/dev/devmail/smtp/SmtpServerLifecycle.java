package dev.devmail.smtp;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import dev.devmail.config.DevMailProperties;
import dev.devmail.mail.MailParser;
import dev.devmail.store.MessageStore;

/** Runs the SMTP listener alongside the web server and feeds every received message into the store. */
@Component
public class SmtpServerLifecycle implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(SmtpServerLifecycle.class);

    private final DevMailProperties.Smtp config;
    private final SmtpServer server;

    public SmtpServerLifecycle(DevMailProperties properties, MailParser parser, MessageStore store) {
        this.config = properties.smtp();
        this.server = new SmtpServer(
                config.host(),
                config.port(),
                config.maxMessageSize().toBytes(),
                mail -> {
                    var message = store.add(parser.parse(mail));
                    log.info("Received \"{}\" from {} ({} bytes)", message.subject(), message.from(), mail.data().length);
                });
    }

    @Override
    public void start() {
        try {
            server.start();
        } catch (IOException e) {
            throw new IllegalStateException(
                    "Could not start the SMTP server on %s:%d (is the port already in use? change devmail.smtp.port): %s"
                            .formatted(config.host(), config.port(), e.getMessage()),
                    e);
        }
    }

    @Override
    public void stop() {
        server.stop();
    }

    @Override
    public boolean isRunning() {
        return server.isRunning();
    }

    /** The port the SMTP server is actually listening on. */
    public int port() {
        return server.port();
    }

    public String host() {
        return config.host();
    }
}
