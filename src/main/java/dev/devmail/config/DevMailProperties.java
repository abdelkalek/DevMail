package dev.devmail.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

@ConfigurationProperties(prefix = "devmail")
public record DevMailProperties(@DefaultValue Smtp smtp, @DefaultValue Store store) {

    /**
     * @param host           interface to bind; 0.0.0.0 accepts connections from other machines/containers
     * @param port           SMTP port; the standard 25 needs elevated privileges, so we default to 2525
     * @param maxMessageSize largest message accepted (advertised via the SMTP SIZE extension)
     */
    public record Smtp(
            @DefaultValue("0.0.0.0") String host,
            @DefaultValue("2525") int port,
            @DefaultValue("10MB") DataSize maxMessageSize) {
    }

    /** @param maxMessages how many messages to keep in memory; the oldest are dropped first */
    public record Store(@DefaultValue("500") int maxMessages) {
    }
}
