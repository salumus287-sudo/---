"use strict";

self.addEventListener("push", function (event) {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (_) {
        data = {
            title: "DRACK HUB",
            body: event.data ? event.data.text() : "Kuna taarifa mpya."
        };
    }

    const title = data.title || "DRACK HUB";
    const options = {
        body: data.body || "Kuna taarifa mpya kwenye DRACK HUB.",
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        tag: data.tag || "drack-hub-notification",
        data: {
            url: data.url || "/"
        }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener("notificationclick", function (event) {
    event.notification.close();

    const destination = new URL(
        event.notification.data?.url || "/",
        self.location.origin
    );

    if (destination.origin !== self.location.origin) {
        return;
    }

    event.waitUntil(
        clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then(function (windows) {
            for (const client of windows) {
                if (client.url.startsWith(self.location.origin) &&
                    "focus" in client) {
                    return client.focus().then(function (focused) {
                        if (focused && "navigate" in focused) {
                            return focused.navigate(destination.href);
                        }
                        return focused;
                    });
                }
            }

            return clients.openWindow(destination.href);
        })
    );
});
