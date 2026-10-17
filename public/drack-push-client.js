(function () {
    "use strict";

    if (!("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)) {
        console.log("DRACK PUSH: Browser hii haitumii Web Push.");
        return;
    }

    function makeButton() {
        if (document.getElementById("drack-push-enable")) return;

        const button = document.createElement("button");
        button.id = "drack-push-enable";
        button.type = "button";
        button.textContent = "🔔 WASHA NOTIFICATIONS";

        Object.assign(button.style, {
            position: "fixed",
            right: "12px",
            bottom: "18px",
            zIndex: "99999",
            padding: "12px 15px",
            border: "0",
            borderRadius: "25px",
            background: "#087f5b",
            color: "#ffffff",
            fontWeight: "bold",
            fontSize: "13px",
            boxShadow: "0 3px 12px rgba(0,0,0,.3)",
            cursor: "pointer"
        });

        button.addEventListener("click", enableNotifications);
        document.body.appendChild(button);

        if (Notification.permission === "granted") {
            button.textContent = "🔔 NOTIFICATIONS";
        } else if (Notification.permission === "denied") {
            button.textContent = "NOTIFICATIONS ZIMEZUIWA";
            button.disabled = true;
            button.style.opacity = "0.7";
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = "=".repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const raw = atob(base64);
        const output = new Uint8Array(raw.length);

        for (let i = 0; i < raw.length; i++) {
            output[i] = raw.charCodeAt(i);
        }

        return output;
    }

    async function enableNotifications() {
        const button = document.getElementById("drack-push-enable");
        button.disabled = true;
        button.textContent = "INAWASHWA...";

        try {
            const permission = await Notification.requestPermission();

            if (permission !== "granted") {
                throw new Error("Hujaruhusu notifications kwenye simu.");
            }

            const keyResponse = await fetch("/api/push/public-key");
            const keyData = await keyResponse.json();

            if (!keyResponse.ok || !keyData.publicKey) {
                throw new Error(keyData.message || "Public key haipatikani.");
            }

            const registration = await navigator.serviceWorker.register(
                "/drack-push-sw.js"
            );

            await navigator.serviceWorker.ready;

            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(keyData.publicKey)
                });
            }

            const response = await fetch("/api/push/subscribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(subscription)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Usajili umeshindwa.");
            }

            button.textContent = "✅ NOTIFICATIONS ZIMEWASHWA";
            button.style.background = "#146c43";
            alert("Hongera! DRACK HUB notifications zimewashwa kwenye simu hii.");
        } catch (error) {
            console.error("DRACK PUSH:", error);
            button.textContent = "🔔 JARIBU TENA";
            alert("Notifications hazijawashwa: " + error.message);
        } finally {
            button.disabled = false;
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", makeButton);
    } else {
        makeButton();
    }
})();
