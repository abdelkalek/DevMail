package dev.devmail.smtp;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A tiny, dependency-free SMTP server that accepts everything and hands each message to a callback.
 *
 * <p>It is a sink for development: no relaying, no TLS, and AUTH accepts any credentials. Each connection runs
 * on its own virtual thread.
 */
public final class SmtpServer {

    private static final Logger log = LoggerFactory.getLogger(SmtpServer.class);
    private static final int MAX_COMMAND_LENGTH = 8192;
    private static final int SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
    private static final Pattern PATH = Pattern.compile("<([^>]*)>");
    private static final Pattern SIZE_PARAM = Pattern.compile("(?i)\\bSIZE=(\\d+)");

    private final String host;
    private final int requestedPort;
    private final long maxMessageSize;
    private final Consumer<ReceivedMail> handler;
    private final Set<Socket> clients = ConcurrentHashMap.newKeySet();

    private volatile ServerSocket serverSocket;
    private volatile ExecutorService executor;

    public SmtpServer(String host, int port, long maxMessageSize, Consumer<ReceivedMail> handler) {
        this.host = host;
        this.requestedPort = port;
        this.maxMessageSize = maxMessageSize;
        this.handler = handler;
    }

    /** Binds the port and starts accepting connections. Throws if the port cannot be bound. */
    public synchronized void start() throws IOException {
        if (serverSocket != null) {
            return;
        }
        ServerSocket socket = new ServerSocket();
        socket.setReuseAddress(true);
        try {
            socket.bind(new InetSocketAddress(InetAddress.getByName(host), requestedPort), 50);
        } catch (IOException e) {
            socket.close();
            throw e;
        }
        this.serverSocket = socket;
        this.executor = Executors.newVirtualThreadPerTaskExecutor();
        Thread acceptor = new Thread(() -> acceptLoop(socket), "smtp-acceptor");
        acceptor.setDaemon(true);
        acceptor.start();
        log.info("SMTP server listening on {}:{}", host, socket.getLocalPort());
    }

    public synchronized void stop() {
        ServerSocket socket = this.serverSocket;
        if (socket == null) {
            return;
        }
        this.serverSocket = null;
        try {
            socket.close();
        } catch (IOException ignored) {
            // shutting down anyway
        }
        for (Socket client : clients) {
            try {
                client.close();
            } catch (IOException ignored) {
                // shutting down anyway
            }
        }
        ExecutorService ex = this.executor;
        if (ex != null) {
            ex.shutdownNow();
        }
        log.info("SMTP server stopped");
    }

    /** The port actually bound (useful when configured with port 0). */
    public int port() {
        ServerSocket socket = this.serverSocket;
        return socket != null ? socket.getLocalPort() : requestedPort;
    }

    public boolean isRunning() {
        return serverSocket != null;
    }

    private void acceptLoop(ServerSocket socket) {
        while (!socket.isClosed()) {
            try {
                Socket client = socket.accept();
                clients.add(client);
                executor.submit(() -> {
                    try (client) {
                        new Session(client).run();
                    } catch (IOException e) {
                        log.debug("SMTP session ended: {}", e.toString());
                    } finally {
                        clients.remove(client);
                    }
                });
            } catch (SocketException e) {
                if (!socket.isClosed()) {
                    log.warn("SMTP accept failed: {}", e.toString());
                }
            } catch (IOException e) {
                log.warn("SMTP accept failed: {}", e.toString());
            }
        }
    }

    private final class Session {
        private final Socket socket;
        private final InputStream in;
        private final OutputStream out;
        private final String remote;

        private String from;
        private List<String> recipients = new ArrayList<>();
        private boolean greeted;

        Session(Socket socket) throws IOException {
            this.socket = socket;
            this.socket.setSoTimeout(SESSION_IDLE_TIMEOUT_MS);
            this.in = new BufferedInputStream(socket.getInputStream());
            this.out = new BufferedOutputStream(socket.getOutputStream());
            this.remote = String.valueOf(socket.getRemoteSocketAddress());
        }

        void run() throws IOException {
            reply("220 devmail ESMTP ready");
            while (true) {
                String line = readCommandLine();
                if (line == null) {
                    return;
                }
                String upper = line.toUpperCase(Locale.ROOT);
                String verb = upper.length() >= 4 ? upper.substring(0, 4) : upper;

                switch (verb) {
                    case "EHLO" -> {
                        greeted = true;
                        resetEnvelope();
                        out.write(("250-devmail greets " + argument(line) + "\r\n").getBytes(StandardCharsets.US_ASCII));
                        out.write(("250-SIZE " + maxMessageSize + "\r\n").getBytes(StandardCharsets.US_ASCII));
                        out.write("250-8BITMIME\r\n".getBytes(StandardCharsets.US_ASCII));
                        out.write("250-SMTPUTF8\r\n".getBytes(StandardCharsets.US_ASCII));
                        out.write("250 AUTH PLAIN LOGIN\r\n".getBytes(StandardCharsets.US_ASCII));
                        out.flush();
                    }
                    case "HELO" -> {
                        greeted = true;
                        resetEnvelope();
                        reply("250 devmail");
                    }
                    case "MAIL" -> handleMail(line, upper);
                    case "RCPT" -> handleRcpt(line, upper);
                    case "DATA" -> {
                        if (from == null || recipients.isEmpty()) {
                            reply("503 5.5.1 Need MAIL and RCPT first");
                        } else {
                            handleData();
                        }
                    }
                    case "RSET" -> {
                        resetEnvelope();
                        reply("250 2.0.0 OK");
                    }
                    case "NOOP" -> reply("250 2.0.0 OK");
                    case "VRFY" -> reply("252 2.5.2 Cannot VRFY user, but will accept message");
                    case "AUTH" -> {
                        if (!handleAuth(line)) {
                            return;
                        }
                    }
                    case "STAR" -> reply("502 5.5.1 STARTTLS is not supported");
                    case "QUIT" -> {
                        reply("221 2.0.0 Bye");
                        return;
                    }
                    default -> reply("500 5.5.2 Command not recognized");
                }
            }
        }

        private void handleMail(String line, String upper) throws IOException {
            if (!upper.startsWith("MAIL FROM:")) {
                reply("501 5.5.4 Syntax: MAIL FROM:<address>");
                return;
            }
            if (!greeted) {
                reply("503 5.5.1 Send EHLO/HELO first");
                return;
            }
            if (from != null) {
                reply("503 5.5.1 Nested MAIL command");
                return;
            }
            String rest = line.substring("MAIL FROM:".length());
            Matcher size = SIZE_PARAM.matcher(rest);
            if (size.find() && Long.parseLong(size.group(1)) > maxMessageSize) {
                reply("552 5.3.4 Message size exceeds limit of " + maxMessageSize + " bytes");
                return;
            }
            Matcher path = PATH.matcher(rest);
            from = path.find() ? path.group(1).trim() : rest.trim().split("\\s+")[0];
            recipients = new ArrayList<>();
            reply("250 2.1.0 OK");
        }

        private void handleRcpt(String line, String upper) throws IOException {
            if (!upper.startsWith("RCPT TO:")) {
                reply("501 5.5.4 Syntax: RCPT TO:<address>");
                return;
            }
            if (from == null) {
                reply("503 5.5.1 Need MAIL command first");
                return;
            }
            String rest = line.substring("RCPT TO:".length());
            Matcher path = PATH.matcher(rest);
            String address = path.find() ? path.group(1).trim() : rest.trim().split("\\s+")[0];
            if (address.isEmpty()) {
                reply("501 5.1.3 Bad recipient address");
                return;
            }
            recipients.add(address);
            reply("250 2.1.5 OK");
        }

        private void handleData() throws IOException {
            reply("354 End data with <CR><LF>.<CR><LF>");
            ByteArrayOutputStream data = new ByteArrayOutputStream(8 * 1024);
            long total = 0;
            boolean tooLarge = false;
            while (true) {
                byte[] line = readLine((int) Math.min(Integer.MAX_VALUE - 8, maxMessageSize + 4096));
                if (line == null) {
                    return; // client went away mid-message
                }
                if (line.length == 1 && line[0] == '.') {
                    break;
                }
                int offset = (line.length > 1 && line[0] == '.') ? 1 : 0; // dot-unstuffing
                total += (line.length - offset) + 2;
                if (total > maxMessageSize) {
                    tooLarge = true; // keep reading until the terminator, but stop buffering
                    continue;
                }
                data.write(line, offset, line.length - offset);
                data.write('\r');
                data.write('\n');
            }

            if (tooLarge) {
                reply("552 5.3.4 Message size exceeds limit of " + maxMessageSize + " bytes");
            } else {
                ReceivedMail mail = new ReceivedMail(from, List.copyOf(recipients), data.toByteArray(), remote, Instant.now());
                try {
                    handler.accept(mail);
                    reply("250 2.0.0 OK message accepted");
                } catch (RuntimeException e) {
                    log.error("Failed to process incoming message", e);
                    reply("451 4.3.0 Local error processing message");
                }
            }
            resetEnvelope();
        }

        /** Accepts any credentials. Returns false when the connection should close. */
        private boolean handleAuth(String line) throws IOException {
            String[] parts = line.trim().split("\\s+", 3);
            String mechanism = parts.length > 1 ? parts[1].toUpperCase(Locale.ROOT) : "";
            String initial = parts.length > 2 ? parts[2] : null;
            switch (mechanism) {
                case "PLAIN" -> {
                    if (initial == null) {
                        reply("334 ");
                        if (readCommandLine() == null) {
                            return false;
                        }
                    }
                }
                case "LOGIN" -> {
                    if (initial == null) {
                        reply("334 " + Base64.getEncoder().encodeToString("Username:".getBytes(StandardCharsets.US_ASCII)));
                        if (readCommandLine() == null) {
                            return false;
                        }
                    }
                    reply("334 " + Base64.getEncoder().encodeToString("Password:".getBytes(StandardCharsets.US_ASCII)));
                    if (readCommandLine() == null) {
                        return false;
                    }
                }
                default -> {
                    reply("504 5.5.4 Unrecognized authentication type");
                    return true;
                }
            }
            reply("235 2.7.0 Authentication successful");
            return true;
        }

        private void resetEnvelope() {
            from = null;
            recipients = new ArrayList<>();
        }

        private void reply(String text) throws IOException {
            out.write((text + "\r\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        }

        private String readCommandLine() throws IOException {
            try {
                byte[] bytes = readLine(MAX_COMMAND_LENGTH);
                return bytes == null ? null : new String(bytes, StandardCharsets.UTF_8).trim();
            } catch (java.net.SocketTimeoutException e) {
                reply("421 4.4.2 Timeout, closing connection");
                return null;
            }
        }

        private static String argument(String line) {
            int space = line.indexOf(' ');
            return space < 0 ? "client" : line.substring(space + 1).trim();
        }

        /** Reads one line without its terminator (CRLF or bare LF). Returns null at end of stream. */
        private byte[] readLine(int maxLength) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream(128);
            int b;
            boolean any = false;
            while ((b = in.read()) != -1) {
                any = true;
                if (b == '\n') {
                    byte[] bytes = buffer.toByteArray();
                    int len = bytes.length;
                    if (len > 0 && bytes[len - 1] == '\r') {
                        len--;
                    }
                    return len == bytes.length ? bytes : java.util.Arrays.copyOf(bytes, len);
                }
                if (buffer.size() >= maxLength) {
                    throw new IOException("Line too long");
                }
                buffer.write(b);
            }
            return any ? buffer.toByteArray() : null;
        }
    }
}
